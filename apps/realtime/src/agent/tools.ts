/**
 * CoSiMo's agentic tools. Claude calls these to act inside the cabin and to
 * express emotion; the handlers drive the WebSocket hub so all four iPads stay
 * in sync. Each handler returns a short string that goes back to Claude as the
 * tool result, plus an optional structured record of what happened (for the
 * research dataset).
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  CHARACTER_IDS,
  EXPRESSIVE_EMOTIONS,
  SCHEME_IDS,
  VOICE_TONES,
  isFaceEmotion,
  type Accommodations,
  type ExpressiveEmotion,
  LIGHT_GROUPS,
  type LightGroup,
  type LightSetRequest,
  type Locale,
  type PersonaKey,
  type TurnAction,
  type VoiceCatalogEntry,
  type VoiceTone,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@cosimo/shared";
import type { Hub } from "../hub.js";
import type { PersonaProvider } from "./personas.js";
import type { ProfileSink } from "./profileSink.js";
import type { TelemetrySimulation } from "./telemetry.js";
import { confirmCard } from "./cards.js";

export interface ToolResult {
  /** Text returned to Claude as the tool_result content. */
  text: string;
  /** Structured action to record on the turn, if any. */
  action?: TurnAction;
  /** Expressive emotion Claude chose, if this was set_emotion. */
  emotion?: ExpressiveEmotion;
}



export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_telemetry",
    description:
      "Fetch journey details the Fahrt-jetzt line does not carry: passenger count, doors, dwell time at this stop, the full stop list (incl. the way back), accessibility notes. For the line, position, upcoming stops/ETAs, delay and faults use the Fahrt-jetzt line instead — no call needed. Speed is never part of what CoSiMo tells a rider.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_light",
    description:
      "The cabin light. It has SCENES the rider switches between — the scene keys and names are listed in your instructions — plus 'aus' (off). 'heller' / 'dunkler' DIM the current scene a step (they never switch scenes or turn the light off). Use `scene` for the light as a whole ('mach es gemütlich' → that scene, 'Licht aus' → aus, 'mach das Licht an' → the first scene, 'etwas dunkler' → dunkler). Use `group` only when the rider names one part of the light — Lichtlinien (the light lines along the roof), Deckenpaneel (the ceiling panel), Boden (the floor light) — with `on`, or `level` 0–100, or `step` heller/dunkler. One light, shared by all seats: a change is for everyone.",
    input_schema: {
      type: "object",
      properties: {
        scene: { type: "string", description: "A scene key from your instructions, or aus | heller | dunkler (heller/dunkler dim the current scene)." },
        group: { type: "string", enum: ["roofline", "rooflight", "floor"], description: "One part of the light: roofline = Lichtlinien, rooflight = Deckenpaneel, floor = Boden." },
        on: { type: "boolean", description: "For a group: on / off." },
        level: { type: "number", minimum: 0, maximum: 100, description: "For a group: brightness 0–100." },
        step: { type: "string", enum: ["heller", "dunkler"], description: "For a group: a bit brighter / darker (±20)." },
      },
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
          enum: ["textSize", "audioOutput", "speechRate", "showText", "reduceMotion", "input", "farbe", "gestalt", "language", "volume", "voice", "tone"],
          description: "Which setting to change.",
        },
        value: {
          type: ["string", "number", "boolean"],
          description:
            "New value. textSize: s|m|l (l is the largest the screen holds; m and s are smaller). input: voice|text|both. showText: true shows your replies as text on screen (speech stays on). audioOutput: false silences you entirely — only on explicit request. reduceMotion: true|false. speechRate: 0.5–1.5. volume: 0–1 playback loudness ('leiser' → 0.5, quieter still → 0.3; audioOutput stays on). voice: female|male (gender default) or a voice key from the Stimmen list in your instructions. tone: neutral|warm|ruhig|lebhaft — the voice's character ('freundlicher' → warm). language: de|en. farbe (the colour scheme, exact ids): weiss (hell), dunkel (schwarz/Nacht), blau, gruen, gelb (warm), rosa (pink), grau. gestalt (what shows in the circle): face (Gesicht) | blob (Knäuel) | circle (Kreis) | line (Linie).",
        },
      },
      required: ["setting", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "show_choices",
    description:
      "Put Ja/Nein chips in the rider's slit for a yes/no question you ask — ALWAYS also ask the question aloud in the same reply, then END your turn; the rider's answer (tap or voice) arrives as their next message. Free-text options do not exist — an open choice (e.g. which lamp) is asked aloud only. Never use it when the request is clear.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The short yes/no question, exactly as you speak it." },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "open_settings",
    description:
      "Open the rider's settings menu in the slit: Textgröße · Lautstärke · Stimme (Tempo, Typ, Stimmung) · Farbe. The rider taps through it alone; the system applies every tap and confirms aloud. Call it when they want to personalise you or adjust something themselves ('dich anpassen', 'einstellen', 'Einstellungen', 'welche Stimmen gibt es', 'zeig mir die Farben') — with `section` when one setting is meant. Say one short sentence ('Hier sind die Einstellungen.') and END your turn. A clear specific request ('stell auf grün') is done with set_presentation instead.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string", enum: ["textSize", "volume", "voice", "theme"], description: "Open straight on this section. Omit for the top level." },
      },
      additionalProperties: false,
    },
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
      return ["s", "m", "l"].includes(String(value))
        ? { patch: { textSize: value as Accommodations["textSize"] } }
        : { error: "textSize must be s|m|l" };
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
    case "gestalt": {
      const raw = String(value).trim().toLowerCase();
      const map: Record<string, string> = { gesicht: "face", face: "face", knäuel: "blob", knaeuel: "blob", blob: "blob", tangle: "blob", kreis: "circle", ring: "circle", circle: "circle", linie: "line", line: "line" };
      const id = map[raw] ?? raw;
      return (CHARACTER_IDS as readonly string[]).includes(id)
        ? { patch: { character: id as Accommodations["character"] } }
        : { error: `gestalt must be one of: ${CHARACTER_IDS.join("|")}` };
    }
    case "volume": {
      let n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return { error: "volume must be a number 0–1" };
      if (n > 1 && n <= 100) n = n / 100; // the model sometimes says 50 for 50%
      return n >= 0 && n <= 1 ? { patch: { volume: n } } : { error: "volume must be 0–1" };
    }
    case "voice": {
      const g = String(value).trim().toLowerCase();
      if (g === "female" || g === "male") return { patch: { voiceGender: g, voice: "" } };
      const entry = voices.find((v) => v.key === g);
      if (entry) return { patch: { voice: entry.key, voiceGender: entry.gender } };
      const keys = voices.map((v) => v.key).join("|");
      return { error: `voice must be female|male${keys ? `|${keys}` : ""}` };
    }
    case "tone": {
      const t = String(value).trim().toLowerCase();
      return (VOICE_TONES as readonly string[]).includes(t)
        ? { patch: { voiceTone: t as VoiceTone } }
        : { error: `tone must be one of: ${VOICE_TONES.join("|")}` };
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

    case "set_light": {
      const light = ctx.hub.currentLight();
      const scenes = light.scenes;
      // "und etwas dunkler" sometimes arrives as step without a group: that is dimming
      const sceneWord = typeof input.scene === "string" ? input.scene.trim().toLowerCase() : typeof input.step === "string" && !input.group ? String(input.step).trim().toLowerCase() : "";
      const group = typeof input.group === "string" && (LIGHT_GROUPS as readonly string[]).includes(input.group) ? (input.group as LightGroup) : null;
      let req: LightSetRequest | null = null;
      if (sceneWord) {
        const dimWord: Record<string, "brighter" | "darker"> = { heller: "brighter", brighter: "brighter", dunkler: "darker", darker: "darker" };
        if (dimWord[sceneWord]) {
          if (light.scene === "off") return { text: "error: the light is off — set a scene first (e.g. the first scene) instead of dimming", action: { tool: name } };
          req = { dim: dimWord[sceneWord] };
        } else {
          const map: Record<string, string> = { aus: "off", off: "off", an: scenes[0]?.key ?? "", on: scenes[0]?.key ?? "" };
          const key = map[sceneWord] ?? scenes.find((s) => s.key === sceneWord || s.label.toLowerCase() === sceneWord)?.key;
          if (!key) return { text: `error: unknown scene "${sceneWord}" — valid: ${scenes.map((s) => s.key).join(", ")}, aus, heller, dunkler`, action: { tool: name } };
          const lit = light.scene !== "off" && LIGHT_GROUPS.some((g) => light.groups[g]?.on);
          if ((sceneWord === "an" || sceneWord === "on") && lit) {
            // "mach das Licht an" while it is on: nothing to do — say so, keep the scene
            const cur = light.scene ? scenes.find((s) => s.key === light.scene)?.label ?? light.scene : "frei";
            return { text: `ok: the light is already on (${cur}) — nothing changed; tell the rider it is already on`, action: { tool: name, args: { scene: "an", already: true, sceneLabel: cur } } };
          }
          if (light.scene === "off" && (sceneWord === "aus" || sceneWord === "off")) {
            return { text: "ok: the light is already off — nothing changed; tell the rider", action: { tool: name, args: { scene: "off", already: true } } };
          }
          req = { scene: key };
        }
      } else if (group) {
        const cur = light.groups[group] ?? { on: false, intensity: 0, bias: 0 };
        const g: NonNullable<LightSetRequest["group"]> = { id: group };
        if (typeof input.on === "boolean") g.on = input.on;
        if (typeof input.level === "number") { g.intensity = Math.max(0, Math.min(100, Math.round(input.level))); g.on = g.intensity > 0; }
        if (input.step === "heller" || input.step === "dunkler") { g.intensity = Math.max(0, Math.min(100, (cur.on ? cur.intensity : 0) + (input.step === "heller" ? 20 : -20))); g.on = g.intensity > 0; }
        if (g.on === undefined && g.intensity === undefined) return { text: "error: for a group pass on, level or step", action: { tool: name } };
        req = { group: g };
      } else {
        return { text: "error: pass scene (a key, aus, heller, dunkler) or group (+ on/level/step)", action: { tool: name } };
      }
      const state = ctx.hub.applyLight(req, ctx.deviceId);
      if (!state) return { text: "error: could not apply", action: { tool: name } };
      const sceneLabel = (state.scene === "off" ? "aus" : state.scene ? scenes.find((s) => s.key === state.scene)?.label ?? state.scene : "frei (einzelne Gruppe geändert)") + (state.dim !== 1 ? ` · gedimmt auf ${Math.round(state.dim * 100)} %` : "");
      const groupsNow = LIGHT_GROUPS.map((g) => `${g}: ${state.groups[g]?.on ? `${state.groups[g]!.intensity}%` : "aus"}`).join(", ");
      const caveat = state.confirmed ? "" : " — the controller has not confirmed yet";
      return {
        text: `ok: light is now "${sceneLabel}" (${groupsNow}) — shared by all seats${caveat}`,
        action: { tool: name, args: { ...(req as unknown as Record<string, unknown>), ...(state.scene && state.scene !== "off" ? { sceneLabel } : {}), ...(req.dim ? { dim: req.dim, dimPct: Math.round(state.dim * 100) } : {}) } },
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
      const card = confirmCard(question, ctx.lang);
      ctx.hub.showCard(ctx.sessionId, card, ctx.turn);
      return {
        text: "ok: Ja/Nein chips are on screen. Ask the question aloud in this same reply and END your turn — the rider's choice arrives as their next message.",
        action: { tool: name, args: { kind: card.kind, question, options: card.options.map((o) => o.label) } },
      };
    }

    case "open_settings": {
      const section = (SETTINGS_SECTIONS as readonly string[]).includes(String(input.section)) ? (input.section as SettingsSection) : undefined;
      const ok = ctx.hub.openSettings(ctx.sessionId, section, ctx.voices, ctx.turn);
      if (!ok) return { text: "error: no active seat", action: { tool: name } };
      return {
        text: `ok: the settings menu is on screen${section ? ` (${section})` : ""}. Say one short sentence and END your turn — the rider taps through it alone, the system confirms each change aloud.`,
        action: { tool: name, args: section ? { section } : {} },
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
