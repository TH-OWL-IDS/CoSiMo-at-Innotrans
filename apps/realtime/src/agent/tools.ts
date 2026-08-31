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
  VOICE_TONES,
  isFaceEmotion,
  type Accommodations,
  type CabinControlId,
  type ExpressiveEmotion,
  type Locale,
  type PersonaKey,
  type TurnAction,
  type VoiceCatalogEntry,
  type VoiceTone,
} from "@cosimo/shared";
import type { Hub } from "../hub.js";
import type { PersonaProvider } from "./personas.js";
import type { ProfileSink } from "./profileSink.js";
import type { TelemetrySimulation } from "./telemetry.js";
import { confirmCard, customizeCard, listCard, scaleCard, themesCard, voicesCard } from "./cards.js";

export interface ToolResult {
  /** Text returned to Claude as the tool_result content. */
  text: string;
  /** Structured action to record on the turn, if any. */
  action?: TurnAction;
  /** Expressive emotion Claude chose, if this was set_emotion. */
  emotion?: ExpressiveEmotion;
}

const CONTROL_IDS = CABIN_CONTROLS.map((c) => c.id);
const SCENE_KEYS = [...new Set(CABIN_CONTROLS.flatMap((c) => c.scenes?.map((s) => s.key) ?? []))];

/** The catalogue as the model reads it — generated so a new light in
 *  CABIN_CONTROLS needs no prompt edit. */
const CONTROL_CATALOG = CABIN_CONTROLS.map((c) => {
  const scope = c.scope === "cabin" ? "shared by ALL seats — changing it changes it for everyone" : "this seat only";
  const kind =
    c.kind === "toggle" ? "on/off" :
    c.kind === "level" ? "dimmable, level 0-100" :
    c.kind === "scene" ? `scene: ${(c.scenes ?? []).map((s) => `'${s.key}'`).join(", ")}` :
    "momentary flash";
  return `'${c.id}' (${c.label.de} / ${c.label.en}; ${kind}; ${scope})`;
}).join("; ");

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_telemetry",
    description:
      "Fetch journey details the Fahrt-jetzt line does not carry: passenger count, doors, dwell time at this stop, the full stop list (incl. the way back), accessibility notes. For position, speed, upcoming stops/ETAs, delay and faults use the Fahrt-jetzt line instead — no call needed.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_cabin_control",
    description:
      `Change a cabin light. Use this when the rider asks to change the lighting. Controls: ${CONTROL_CATALOG}. Pass exactly the field matching the control's kind: on for on/off, level for dimming, scene for a scene, flash:true for a flash.`,
    input_schema: {
      type: "object",
      properties: {
        control: { type: "string", enum: CONTROL_IDS, description: "Which cabin control to change." },
        on: { type: "boolean", description: "On/off (toggle controls)." },
        level: { type: "number", minimum: 0, maximum: 100, description: "Brightness 0-100 (level controls)." },
        ...(SCENE_KEYS.length ? { scene: { type: "string", enum: SCENE_KEYS, description: "Scene key (scene controls)." } } : {}),
        flash: { type: "boolean", description: "true for a momentary flash (flash controls)." },
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
          enum: ["textSize", "audioOutput", "speechRate", "showText", "reduceMotion", "input", "farbe", "language", "volume", "voice", "tone"],
          description: "Which setting to change.",
        },
        value: {
          type: ["string", "number", "boolean"],
          description:
            "New value. textSize: s|m|l|xl. input: voice|text|both. showText: true shows your replies as text on screen (speech stays on). audioOutput: false silences you entirely — only on explicit request. reduceMotion: true|false. speechRate: 0.5–1.5. volume: 0–1 playback loudness ('leiser' → 0.5, quieter still → 0.3; audioOutput stays on). voice: female|male (gender default) or a voice key from the Stimmen list in your instructions. tone: neutral|warm|ruhig|lebhaft — the voice's character ('freundlicher' → warm). language: de|en. farbe (the colour scheme, exact ids): weiss (hell), dunkel (schwarz/Nacht), blau, gruen, gelb (warm), rosa (pink), grau.",
        },
      },
      required: ["setting", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "show_choices",
    description:
      "Put tappable options in the rider's slit — ALWAYS also ask the question aloud in the same reply, then END your turn. Kinds: 'confirm' = Ja/Nein for any yes/no question you ask; 'list' = 2–4 short options (ambiguity: 'mach eine Lampe an' → Innenlicht/Leselampe); 'themes' = colour palette; 'voices' = the voice catalog; 'scale' = a slider for volume/speechRate or −/+ for textSize. themes/voices/scale are applied by the system itself when tapped (it also confirms aloud) — do not call set_presentation for them. The rider may still answer by voice. Never use a card when the request is clear.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The short question, exactly as you speak it." },
        kind: { type: "string", enum: ["confirm", "list", "themes", "voices", "scale"], description: "Default 'list'." },
        options: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 4,
          description: "For kind 'list' only: 2–4 short labels in the rider's language.",
        },
        setting: { type: "string", enum: ["volume", "speechRate", "textSize"], description: "For kind 'scale': which setting the slider changes." },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "start_customizer",
    description:
      "Start the step-by-step look-and-voice customizer when the rider wants to personalise you ('ich möchte dein Aussehen individualisieren', 'kann ich dich anpassen'). The system walks them through colour → text size → voice → tempo with tappable steps and confirms each aloud. You only say a short intro plus the first question, then END your turn.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "remember",
    description:
      "Store a fact or preference the rider asks you to keep in mind ('merk dir', 'denk dran', 'vergiss nicht, dass', 'remember'): their name, a habit, a need, where they get off. Call it EVERY time such a request comes, in the same turn as your confirmation — never confirm without the call. Only works for a registered rider who agreed to being remembered; otherwise the result tells you to say you can't.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "A short note in the third person, written in the rider's language (German for a German rider), e.g. 'Steigt immer in Barntrup aus.'" },
      },
      required: ["note"],
      additionalProperties: false,
    },
  },
  {
    name: "forget",
    description: "Delete a stored note (or everything) when the rider asks to un-remember: 'vergiss das wieder', 'lösch das', 'streich das'. NOT for 'vergiss nicht, dass …' — that is a remember request.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "A word from the note to forget (e.g. 'Kaffee'), or 'all' to clear everything — only when the rider asks for everything." },
      },
      required: ["note"],
      additionalProperties: false,
    },
  },
];

/** Everyday colour words → scheme ids (de/en, old ids kept for stored profiles). */
const COLOUR_WORDS: Record<string, string> = {
  "weiß": "weiss", weiss: "weiss", white: "weiss", hell: "weiss", classic: "weiss", klassisch: "weiss",
  dunkel: "dunkel", schwarz: "dunkel", dark: "dunkel", black: "dunkel", nacht: "dunkel", night: "dunkel",
  blau: "blau", blue: "blau", ozean: "blau", ocean: "blau",
  "grün": "gruen", gruen: "gruen", green: "gruen", wald: "gruen", forest: "gruen",
  gelb: "gelb", yellow: "gelb", sonne: "gelb", sun: "gelb", warm: "gelb", orange: "gelb",
  rosa: "rosa", pink: "rosa", beere: "rosa", berry: "rosa", lila: "rosa",
  grau: "grau", gray: "grau", grey: "grau", schiefer: "grau", slate: "grau",
};

/** Coerce a tool value to boolean (accepts true/false or "true"/"false"). */
function toBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

type PresPatch = { patch: Partial<Accommodations> } | { error: string };

/** Validate a set_presentation (setting, value) into an accommodation patch. */
function presentationPatch(setting: string, value: unknown, voices: VoiceCatalogEntry[]): PresPatch {
  switch (setting) {
    case "textSize":
      return ["s", "m", "l", "xl"].includes(String(value))
        ? { patch: { textSize: value as Accommodations["textSize"] } }
        : { error: "textSize must be s|m|l|xl" };
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
    case "farbe":
    case "theme": {
      // Strict ids, but the everyday words map onto them ("grün", "pink",
      // "schwarz", "hell") — an unknown value would silently render as
      // "weiss" on the kiosk while CoSiMo claims success.
      const raw = String(value).trim().toLowerCase();
      const id = COLOUR_WORDS[raw] ?? raw;
      return (SCHEME_IDS as readonly string[]).includes(id)
        ? { patch: { theme: id } }
        : { error: `farbe must be one of: ${SCHEME_IDS.join("|")}` };
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
  /** The operator's voice catalog (validates set_presentation voice=<key>). */
  voices: VoiceCatalogEntry[];
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
      // Compact, single-language: the same facts the Fahrt-jetzt line carries
      // plus the details it leaves out — not the whole bilingual object.
      const l = ctx.lang;
      const here = t.stops[t.position.stopIndex];
      const compact = {
        location: t.location[l],
        speedKmh: Math.round(t.speedKmh),
        phase: t.position.phase,
        direction: t.position.direction,
        line: t.line[l],
        destination: t.destination[l],
        upcomingStops: t.nextStops.map((st, i, all) => ({ name: st.name[l], etaMinutes: st.etaMinutes, ...(i === all.length - 1 ? { terminal: true } : {}) })),
        allStops: t.stops.map((st) => st.name[l]),
        delayMinutes: t.delayMinutes,
        fault: t.faults[0] ? { kind: t.faults[0].kind, cause: t.faults[0].cause[l], remainingSec: t.faults[0].remainingSec } : null,
        passengers: { aboard: t.occupancy, capacity: t.capacity },
        doorsOpen: t.doorsOpen,
        dwellSecondsAtThisStop: here?.dwellSeconds ?? null,
        ...(t.notes ? { notes: t.notes[l] } : {}),
        ...(t.simPaused ? { simulationPaused: true } : {}),
      };
      return { text: JSON.stringify(compact), action: { tool: name } };
    }

    case "set_cabin_control": {
      const control = input.control as CabinControlId;
      const def = CABIN_CONTROLS.find((c) => c.id === control);
      if (!def) {
        return { text: `error: unknown control "${String(input.control)}"`, action: { tool: name } };
      }
      // Accept only what the control's kind understands — a level on a
      // toggle is a model mistake the result should teach, not a throw.
      const change: { on?: boolean; level?: number; scene?: string; flash?: true } = {};
      if (def.kind === "toggle" && typeof input.on === "boolean") change.on = input.on;
      if (def.kind === "level") {
        if (typeof input.level === "number") change.level = Math.max(0, Math.min(100, Math.round(input.level)));
        else if (typeof input.on === "boolean") change.on = input.on; // "aus"/"an" on a dimmer is fine
      }
      if (def.kind === "scene" && typeof input.scene === "string") {
        if (!def.scenes?.some((sc) => sc.key === input.scene)) {
          return { text: `error: unknown scene "${String(input.scene)}" for ${control} — valid: ${(def.scenes ?? []).map((sc) => sc.key).join(", ")}`, action: { tool: name } };
        }
        change.scene = input.scene;
      }
      if (def.kind === "flash" && input.flash === true) change.flash = true;
      if (Object.keys(change).length === 0) {
        return { text: `error: ${control} is a ${def.kind} control — pass ${def.kind === "toggle" ? "on" : def.kind === "flash" ? "flash:true" : def.kind}`, action: { tool: name } };
      }
      const state = await ctx.hub.applyCabinControl(ctx.deviceId, control, change);
      const shared = def.scope === "cabin" ? " (shared cabin light — changed for all seats)" : "";
      const now = def.kind === "flash" ? "flashed" : `now ${JSON.stringify({ on: state.on, level: state.level, scene: state.scene })}`;
      const caveat = state.degraded ? " — but the controller did not confirm; the screens show the intent" : "";
      return {
        text: `ok: ${control}${shared} ${now}${caveat}`,
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
      const result = presentationPatch(setting, input.value, ctx.voices);
      if ("error" in result) return { text: `error: ${result.error}`, action: { tool: name } };
      const acc = ctx.hub.patchSeatAccommodations(ctx.deviceId, result.patch);
      if (!acc) return { text: "error: no active seat", action: { tool: name } };
      persistAccommodations(ctx, acc);
      return { text: `ok: ${setting} is now ${String(input.value)}`, action: { tool: name, args: { setting, value: input.value } } };
    }

    case "show_choices": {
      const question = String(input.question ?? "").trim();
      if (!question) return { text: "error: question is required", action: { tool: name } };
      const kind = String(input.kind ?? "list");
      const acc = ctx.hub.accommodationsOf(ctx.sessionId) ?? ctx.personas.get(ctx.persona).accommodations;
      let card;
      switch (kind) {
        case "confirm":
          card = confirmCard(question, ctx.lang);
          break;
        case "themes":
          card = themesCard(question, ctx.lang);
          break;
        case "voices":
          card = voicesCard(question, ctx.lang, ctx.voices);
          break;
        case "scale": {
          const setting = input.setting === "speechRate" || input.setting === "textSize" ? input.setting : "volume";
          card = scaleCard(question, setting, acc, ctx.lang);
          break;
        }
        default: {
          const options = (Array.isArray(input.options) ? input.options : []).map((o) => String(o).trim()).filter(Boolean);
          if (options.length < 2) return { text: "error: kind 'list' needs 2–4 options", action: { tool: name } };
          card = listCard(question, options);
        }
      }
      ctx.hub.showCard(ctx.sessionId, card, ctx.turn);
      return {
        text: card.local
          ? "ok: on screen. The system applies the rider's tap itself and confirms aloud. Ask the question aloud now and END your turn."
          : "ok: options are on screen. Ask the question aloud in this same reply and END your turn — the rider's choice arrives as their next message.",
        action: { tool: name, args: { kind: card.kind, question, options: card.options.map((o) => o.label) } },
      };
    }

    case "start_customizer": {
      const acc = ctx.hub.accommodationsOf(ctx.sessionId) ?? ctx.personas.get(ctx.persona).accommodations;
      const first = customizeCard(0, ctx.lang, ctx.voices, acc);
      if (!first) return { text: "error: customizer unavailable", action: { tool: name } };
      ctx.hub.setWizardStep(ctx.sessionId, 0);
      ctx.hub.showCard(ctx.sessionId, first, ctx.turn);
      return {
        text: `ok: the customizer is on screen (step 1: colour). Say a short friendly intro and then exactly this question aloud: "${first.question}" — then END your turn. The system handles every following step.`,
        action: { tool: name },
      };
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
      const match = typeof input.note === "string" ? input.note.trim() : "";
      if (!match) return { text: "error: say which note to forget (a word from it) or 'all'", action: { tool: name } };
      const removed = ctx.personas.forgetLocal(ctx.persona, match);
      if (removed === 0) return { text: `note: nothing stored matches "${match}" — the stored notes are listed in your instructions; nothing was deleted, say so.`, action: { tool: name, args: { note: match } } };
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
 *  The shared `default` clean plate is never written back — a walk-up seat's
 *  changes live only in the seat state and die with the session. (Writing it
 *  unconditionally once leaked one seat's "leiser bitte" to every kiosk.) */
function persistAccommodations(ctx: ToolContext, accommodations: Accommodations): void {
  if (!ctx.personas.isPersistable(ctx.persona)) return;
  ctx.personas.setAccommodationsLocal(ctx.persona, accommodations);
  void ctx.profiles.saveAccommodations(ctx.persona, accommodations);
}
