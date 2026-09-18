/**
 * Cabin controls CoSiMo can operate as agentic tools. `real` marks a control
 * backed by hardware (an LPU-2 playback); the rest are simulated on screen.
 *
 * `scope` says who owns the state: the cabin has ONE interior light shared by
 * all four seats — switching it from seat 1 changes it for everyone, so its
 * state lives once on the hub (`cabinControls`) and every seat and host gets
 * the change. A `seat`-scoped control (the reading lamp) is that seat's own.
 */

import type { Locale } from "./telemetry.js";

export type CabinControlId =
  | "interior-light" // real (LPU-2 light)
  | "reading-lamp";

export interface CabinControlDef {
  id: CabinControlId;
  label: Record<Locale, string>;
  /** True for a hardware-backed control (an LPU-2 playback drives it). */
  real: boolean;
  /** "toggle" = on/off · "level" = 0..100 (native LPU-2 intensity) ·
   *  "scene" = one of `scenes` (an LPU-2 cue jump) · "flash" = momentary,
   *  carries no state at all. */
  kind: "toggle" | "level" | "scene" | "flash";
  /** "cabin" = one shared state on the hub, broadcast to every seat;
   *  "seat" = each seat has its own. */
  scope: "cabin" | "seat";
  /** For "scene" controls: the selectable scenes. Keys are code-defined
   *  (the CMS maps each key to an LPU-2 cue number, never invents keys). */
  scenes?: { key: string; label: Record<Locale, string> }[];
}

export interface CabinControlState {
  id: CabinControlId;
  /** For toggle controls. */
  on?: boolean;
  /** For level controls, 0..100. */
  level?: number;
  /** For scene controls: the active scene key. */
  scene?: string;
  /** True when the (real) device was unreachable and we are showing last-known. */
  degraded?: boolean;
}

/**
 * One cabin actuation the *kiosk* performs on the cabin LAN. The server decides
 * what should happen and hands over ready-made URLs; the kiosk just fires them
 * and reports back. The kiosk therefore knows nothing about DMX, playbacks or
 * the controller's dialect — meaning stays server-side (see AGENTS.md rule 5).
 *
 * Why the seat and not the hub: the cabin LAN is air-gapped and will never get
 * an uplink, so a hub on the VPS cannot reach the light controller. The iPads
 * are the only dual-homed devices (Wi-Fi → hub, Ethernet → cabin LAN), which
 * makes them the actuators. The calls are idempotent — a repeat is harmless.
 */
export interface CabinActuation {
  /** A CabinControlId, or a host light key (zones/signals/global) — the
   *  kiosk never interprets it, it only echoes it in the result. */
  control: string;
  /** Absolute URLs to GET in order, built server-side. */
  urls: string[];
  /** Per-request timeout; the cabin LAN is local, so this is short. */
  timeoutMs: number;
}

/** What the kiosk reports back after trying an actuation. */
export interface CabinActuationResult {
  control: string;
  ok: boolean;
  /** Short reason when it failed — surfaced in the host console. */
  error?: string;
}

/**
 * The rig's playback catalog (Cuety table, 2026-09-02). Every entry is one
 * CMS-mappable key → LPU-2 playback. Zones come as CW/WW pairs (playbacks
 * are additive, so switching a zone to WW must release its CW sibling);
 * reading lamps are individual per seat (the kiosk's configured seat number
 * picks the key). The rider reaches only the rooflight (via
 * `interior-light`, WW is the spoken default) and their own reading lamp —
 * everything else is host-only, driven from the console.
 */
export interface Lpu2KeyDef {
  key: string;
  label: string;
  group: "rider" | "zone" | "signal";
}

/** Console-operable zones (each `<id>-cw` / `<id>-ww` mapping key). */
export const LIGHT_ZONES: { id: string; label: string }[] = [
  { id: "outer", label: "Au\u00dfenlicht" },
  { id: "floor", label: "Bodenlicht" },
  { id: "roofline", label: "Lichtlinien" },
  { id: "headrests", label: "Kopfst\u00fctzen" },
  { id: "signals", label: "Signale wei\u00df" },
];

/** The red signal playbacks — host-only, momentary toggles (go/re). */
export const LIGHT_SIGNALS: { id: string; label: string }[] = [
  { id: "signals-front-red", label: "Signal vorn rot" },
  { id: "signals-rear-red", label: "Signal hinten rot" },
  { id: "signals-front-flash", label: "Signal vorn rot blinkend" },
  { id: "signals-rear-flash", label: "Signal hinten rot blinkend" },
];

export const LPU2_KEYS: Lpu2KeyDef[] = [
  { key: "interior-light-cw", label: "Deckenpaneel (Rooflight) \u2013 kaltwei\u00df", group: "rider" },
  { key: "interior-light-ww", label: "Deckenpaneel (Rooflight) \u2013 warmwei\u00df", group: "rider" },
  { key: "reading-1", label: "Leselampe Sitz 1 (vorn)", group: "rider" },
  { key: "reading-2", label: "Leselampe Sitz 2 (Mitte vorn)", group: "rider" },
  { key: "reading-3", label: "Leselampe Sitz 3 (Mitte hinten)", group: "rider" },
  { key: "reading-4", label: "Leselampe Sitz 4 (hinten)", group: "rider" },
  ...LIGHT_ZONES.flatMap(({ id, label }) => [
    { key: `${id}-cw`, label: `${label} \u2013 kaltwei\u00df`, group: "zone" as const },
    { key: `${id}-ww`, label: `${label} \u2013 warmwei\u00df`, group: "zone" as const },
  ]),
  ...LIGHT_SIGNALS.map(({ id, label }) => ({ key: id, label, group: "signal" as const })),
  // the signal light's RGB playbacks (installer sheet 2026-09-18: 38/39/40)
  { key: "signals-red", label: "Signallicht \u2013 rot", group: "signal" },
  { key: "signals-green", label: "Signallicht \u2013 gr\u00fcn", group: "signal" },
  { key: "signals-blue", label: "Signallicht \u2013 blau", group: "signal" },
];

/** Host-only global actions (no playback, fixed endpoints). */
export type HostLightGlobal = "blackout" | "release-all" | "hello";

export const CABIN_CONTROLS: CabinControlDef[] = [
  { id: "interior-light", label: { de: "Innenlicht", en: "Interior light" }, real: true, kind: "toggle", scope: "cabin" },
  { id: "reading-lamp", label: { de: "Leselampe", en: "Reading lamp" }, real: true, kind: "toggle", scope: "seat" },
];
