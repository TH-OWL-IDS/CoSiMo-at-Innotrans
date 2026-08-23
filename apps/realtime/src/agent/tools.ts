/**
 * CoSiMo's agentic tools. Claude calls these to act inside the cabin and to
 * express emotion; the handlers drive the WebSocket hub so all four iPads stay
 * in sync. Each handler returns a short string that goes back to Claude as the
 * tool result, plus an optional structured record of what happened (for the
 * research dataset).
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  CABIN_CONTROLS,
  EXPRESSIVE_EMOTIONS,
  SCHEME_IDS,
  isFaceEmotion,
  type Accommodations,
  type CabinControlId,
  type ExpressiveEmotion,
  type Locale,
  type PersonaKey,
  type TurnAction,
} from "@cosimo/shared";
import type { Hub } from "../hub.js";
import type { PersonaProvider } from "./personas.js";
import type { ProfileSink } from "./profileSink.js";
import type { TelemetrySimulation } from "./telemetry.js";

export interface ToolResult {
  /** Text returned to Claude as the tool_result content. */
  text: string;
  /** Structured action to record on the turn, if any. */
  action?: TurnAction;
  /** Expressive emotion Claude chose, if this was set_emotion. */
  emotion?: ExpressiveEmotion;
}

const CONTROL_IDS = CABIN_CONTROLS.map((c) => c.id);

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_telemetry",
    description:
      "Get the MonoCab's current status: speed, location, line, destination, next stops with arrival times, occupancy, battery and doors. Call this whenever the rider asks anything about the journey, timing, or where we are.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_cabin_control",
    description:
      "Turn a cabin function on/off or set its level. Use this when the rider asks to change the cabin (light, reading lamp, ventilation, window tint, ambient sound). 'interior-light' is real hardware; the others are simulated.",
    input_schema: {
      type: "object",
      properties: {
        control: { type: "string", enum: CONTROL_IDS, description: "Which cabin control to change." },
        on: { type: "boolean", description: "On/off for toggle controls (interior-light, reading-lamp, ambient-sound)." },
        level: { type: "integer", minimum: 0, maximum: 100, description: "0–100 for level controls (ventilation, window-tint)." },
      },
      required: ["control"],
      additionalProperties: false,
    },
  },
  {
    name: "request_stop",
    description:
      "Register a request to stop at an upcoming stop, on the rider's behalf. This is a demo action — it does not control the real vehicle.",
    input_schema: {
      type: "object",
      properties: {
        stopId: { type: "string", description: "Id of the upcoming stop, from get_telemetry's nextStops." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_emotion",
    description:
      "Set your facial expression to colour the reply. Use sparingly and genuinely: 'happy' for warm/helpful moments, 'surprised' for something unexpected, 'sad' when you cannot help or share bad news, 'neutral' to reset. Mechanical states (listening/thinking/speaking) are handled automatically — do not set those.",
    input_schema: {
      type: "object",
      properties: {
        emotion: { type: "string", enum: [...EXPRESSIVE_EMOTIONS], description: "The expressive emotion to show." },
      },
      required: ["emotion"],
      additionalProperties: false,
    },
  },
  {
    name: "set_presentation",
    description:
      "Change ONE accessible presentation setting for this rider, when they ask (e.g. 'make the text bigger', 'read that aloud', 'show me the text', 'calmer face', 'darker colours'). Applies immediately; for a registered rider it is remembered next time. For a bigger change (e.g. they can no longer see) decide which specific settings that rider needs and call this once per setting. IMPORTANT: 'show me the text' / 'Text anzeigen' = showText:true — this ADDS the on-screen transcript and keeps speech on. Never turn audioOutput off unless the rider explicitly says they do not want to hear you.",
    input_schema: {
      type: "object",
      properties: {
        setting: {
          type: "string",
          enum: ["textSize", "contrast", "audioOutput", "speechRate", "showText", "reduceMotion", "input", "theme", "language"],
          description: "Which setting to change.",
        },
        value: {
          type: ["string", "number", "boolean"],
          description:
            "New value. textSize: s|m|l|xl. contrast: normal|high. input: voice|text|both. showText: true shows your replies as text on screen (speech stays on). audioOutput: false silences you entirely — only on explicit request. reduceMotion: true|false. speechRate: 0.5–1.5. language: de|en. theme (exact ids): classic (hell/weiß), night (dunkel), ocean (blau), forest (grün), sun (warm/gelb), berry (pink), slate (grau).",
        },
      },
      required: ["setting", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "remember",
    description:
      "Remember a short fact or preference the rider EXPLICITLY asks you to remember about them (their name, that they prefer short answers, a need). Only works for a registered rider who agreed to being remembered — otherwise say you can't.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "A short note in the third person, e.g. 'Prefers short answers'." },
      },
      required: ["note"],
      additionalProperties: false,
    },
  },
  {
    name: "forget",
    description: "Forget something you remembered about the rider — a specific note, or everything — when they ask.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "Substring of the note to forget, or 'all' to clear everything." },
      },
      additionalProperties: false,
    },
  },
];

/** Coerce a tool value to boolean (accepts true/false or "true"/"false"). */
function toBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

type PresPatch = { patch: Partial<Accommodations> } | { error: string };

/** Validate a set_presentation (setting, value) into an accommodation patch. */
function presentationPatch(setting: string, value: unknown): PresPatch {
  switch (setting) {
    case "textSize":
      return ["s", "m", "l", "xl"].includes(String(value))
        ? { patch: { textSize: value as Accommodations["textSize"] } }
        : { error: "textSize must be s|m|l|xl" };
    case "contrast":
      return ["normal", "high"].includes(String(value))
        ? { patch: { contrast: value as Accommodations["contrast"] } }
        : { error: "contrast must be normal|high" };
    case "input":
      return ["voice", "text", "both"].includes(String(value))
        ? { patch: { input: value as Accommodations["input"] } }
        : { error: "input must be voice|text|both" };
    case "audioOutput": {
      const b = toBool(value);
      return b === undefined ? { error: "audioOutput must be true|false" } : { patch: { audioOutput: b } };
    }
    case "showText": {
      const b = toBool(value);
      return b === undefined ? { error: "showText must be true|false" } : { patch: { showText: b } };
    }
    case "reduceMotion": {
      const b = toBool(value);
      return b === undefined ? { error: "reduceMotion must be true|false" } : { patch: { reduceMotion: b } };
    }
    case "speechRate": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) && n >= 0.5 && n <= 1.5
        ? { patch: { speechRate: n } }
        : { error: "speechRate must be a number 0.5–1.5" };
    }
    case "theme": {
      // Strict: an unknown id would silently render as "classic" on the
      // kiosk while CoSiMo claims success (the LLM once sent "dark").
      const id = String(value).trim().toLowerCase();
      return (SCHEME_IDS as readonly string[]).includes(id)
        ? { patch: { theme: id } }
        : { error: `theme must be one of: ${SCHEME_IDS.join("|")}` };
    }
    case "language":
      return value === "de" || value === "en"
        ? { patch: { language: value } }
        : { error: "language must be de|en" };
    default:
      return { error: `unknown setting "${setting}"` };
  }
}

export interface ToolContext {
  hub: Hub;
  telemetry: TelemetrySimulation;
  personas: PersonaProvider;
  profiles: ProfileSink;
  lang: Locale;
  deviceId: string;
  /** The calling seat's session — scopes per-seat effects (the face) to it. */
  sessionId: string;
  /** The seat's turn number, so a barged-in turn's emotion is dropped. */
  turn: number;
  /** The active profile key for the calling seat (for profile-mutating tools). */
  persona: PersonaKey;
  /** Whether the visitor consented to being remembered (gates `remember`). */
  consent: boolean;
}

/** Execute a tool call and return the result for Claude + the turn record. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "get_telemetry": {
      const t = await ctx.telemetry.refresh();
      ctx.hub.emitTelemetry(t);
      return { text: JSON.stringify(t), action: { tool: name } };
    }

    case "set_cabin_control": {
      const control = input.control as CabinControlId;
      if (!CONTROL_IDS.includes(control)) {
        return { text: `error: unknown control "${String(input.control)}"`, action: { tool: name } };
      }
      const change: { on?: boolean; level?: number } = {};
      if (typeof input.on === "boolean") change.on = input.on;
      if (typeof input.level === "number") change.level = input.level;
      const state = await ctx.hub.applyCabinControl(ctx.deviceId, control, change);
      return {
        text: `ok: ${control} is now ${JSON.stringify({ on: state.on, level: state.level })}`,
        action: { tool: name, control, args: change },
      };
    }

    case "request_stop": {
      const stopId = typeof input.stopId === "string" ? input.stopId : undefined;
      return {
        text: `ok: stop request registered${stopId ? ` for "${stopId}"` : ""} (demo — vehicle not actually controlled)`,
        action: { tool: name, args: stopId ? { stopId } : undefined },
      };
    }

    case "set_emotion": {
      const emotion = input.emotion;
      if (!isFaceEmotion(emotion)) {
        return { text: `error: unknown emotion "${String(emotion)}"`, action: { tool: name } };
      }
      // Per seat: the face belongs to the rider who caused it. Broadcasting
      // here coloured all four cabin faces from one seat's conversation, and
      // bypassed the turn guard that drops a barged-in turn's leftovers.
      ctx.hub.setEmotion(emotion, ctx.sessionId, ctx.turn);
      return { text: "ok", action: { tool: name, args: { emotion } }, emotion: emotion as ExpressiveEmotion };
    }

    case "set_presentation": {
      const setting = String(input.setting ?? "");
      const result = presentationPatch(setting, input.value);
      if ("error" in result) return { text: `error: ${result.error}`, action: { tool: name } };
      const acc = ctx.hub.patchSeatAccommodations(ctx.deviceId, result.patch);
      if (!acc) return { text: "error: no active seat", action: { tool: name } };
      persistAccommodations(ctx, acc);
      return { text: `ok: ${setting} is now ${String(input.value)}`, action: { tool: name, args: { setting, value: input.value } } };
    }

    case "remember": {
      const note = String(input.note ?? "").trim();
      if (!note) return { text: "error: empty note", action: { tool: name } };
      if (!ctx.personas.isPersistable(ctx.persona)) {
        return {
          text: "note: this rider is not a registered account, so there is nothing to remember them by. Tell them you can only remember things for registered riders with their own card.",
          action: { tool: name },
        };
      }
      if (!ctx.consent) {
        return {
          text: "note: the rider has not agreed to being remembered (no consent). Do not claim to have remembered anything; offer to remember it only if they consent.",
          action: { tool: name },
        };
      }
      const mem = ctx.personas.rememberLocal(ctx.persona, note);
      if (!mem) return { text: "error: could not remember that", action: { tool: name } };
      void ctx.profiles.saveMemories(ctx.persona, ctx.personas.memoriesOf(ctx.persona));
      ctx.hub.refreshSeats();
      return { text: `ok: remembered "${mem.note}"`, action: { tool: name, args: { note: mem.note } } };
    }

    case "forget": {
      if (!ctx.personas.isPersistable(ctx.persona)) {
        return { text: "note: nothing is stored for this rider (not a registered account).", action: { tool: name } };
      }
      const match = typeof input.note === "string" ? input.note : undefined;
      const removed = ctx.personas.forgetLocal(ctx.persona, match);
      if (removed > 0) {
        void ctx.profiles.saveMemories(ctx.persona, ctx.personas.memoriesOf(ctx.persona));
        ctx.hub.refreshSeats();
      }
      return { text: `ok: forgot ${removed} note(s)`, action: { tool: name, args: match ? { note: match } : undefined } };
    }

    default:
      return { text: `error: unknown tool "${name}"` };
  }
}

/** Persist accommodations for a card-bound rider (card-basis; no consent gate).
 *  The shared `default` clean plate is never written back. */
function persistAccommodations(ctx: ToolContext, accommodations: Accommodations): void {
  ctx.personas.setAccommodationsLocal(ctx.persona, accommodations);
  if (ctx.personas.isPersistable(ctx.persona)) void ctx.profiles.saveAccommodations(ctx.persona, accommodations);
}
