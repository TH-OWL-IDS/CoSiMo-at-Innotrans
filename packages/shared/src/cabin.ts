/**
 * Cabin controls CoSiMo can operate as agentic tools. Exactly one is backed by
 * real hardware (the Shelly relay light); the rest are simulated on-screen and
 * synced to all iPads. The `real` flag marks which is physical.
 */

import type { Locale } from "./telemetry.js";

export type CabinControlId =
  | "interior-light" // real (Shelly relay)
  | "reading-lamp"
  | "ventilation"
  | "window-tint"
  | "ambient-sound";

export interface CabinControlDef {
  id: CabinControlId;
  label: Record<Locale, string>;
  /** True only for the hardware-backed control. */
  real: boolean;
  /** "toggle" = on/off; "level" = 0..100. */
  kind: "toggle" | "level";
}

export interface CabinControlState {
  id: CabinControlId;
  /** For toggle controls. */
  on?: boolean;
  /** For level controls, 0..100. */
  level?: number;
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
  { id: "interior-light", label: { de: "Innenlicht", en: "Interior light" }, real: true, kind: "toggle" },
  { id: "reading-lamp", label: { de: "Leselampe", en: "Reading lamp" }, real: false, kind: "toggle" },
  { id: "ventilation", label: { de: "Belüftung", en: "Ventilation" }, real: false, kind: "level" },
  { id: "window-tint", label: { de: "Fenstertönung", en: "Window tint" }, real: false, kind: "level" },
  { id: "ambient-sound", label: { de: "Klangkulisse", en: "Ambient sound" }, real: false, kind: "toggle" },
];
