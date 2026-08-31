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
  control: CabinControlId;
  /** Absolute URLs to GET in order, built server-side. */
  urls: string[];
  /** Per-request timeout; the cabin LAN is local, so this is short. */
  timeoutMs: number;
}

/** What the kiosk reports back after trying an actuation. */
export interface CabinActuationResult {
  control: CabinControlId;
  ok: boolean;
  /** Short reason when it failed — surfaced in the host console. */
  error?: string;
}

export const CABIN_CONTROLS: CabinControlDef[] = [
  { id: "interior-light", label: { de: "Innenlicht", en: "Interior light" }, real: true, kind: "toggle", scope: "cabin" },
  { id: "reading-lamp", label: { de: "Leselampe", en: "Reading lamp" }, real: false, kind: "toggle", scope: "seat" },
];
