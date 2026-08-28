/**
 * Mocked MonoCab telemetry. This is the shape CoSiMo reads from to answer
 * questions ("how fast are we going?", "when do we arrive?"). It is produced
 * by a small server-side journey simulation (realtime `telemetry.ts`) driving
 * the CMS `route-config` route back and forth — there is no real MonoCab
 * integration (explicitly out of scope).
 */

export type Locale = "de" | "en";

export interface RouteStop {
  /** Stable id, e.g. "lemgo-luettfeld". */
  id: string;
  /** Display name per locale. */
  name: Record<Locale, string>;
  /** Minutes from "now" until arrival at this stop (mocked, can be scripted). */
  etaMinutes: number;
}

/**
 * Things that go wrong on the line. First-class simulation state, so CoSiMo
 * can see and explain them ("why are we stopped?") and the journey view can
 * show them. Injected by a CMS scenario (unattended booth loop) or by the
 * host on demand (the console's Fahrt card).
 */
export type FaultKind =
  /** Unscheduled stop between stations; ETAs slip by the hold. */
  | "signal-hold"
  /** Doors won't close; dwell extends, doors stay open. */
  | "door-fault"
  /** Reduced cruise speed on the current leg. */
  | "slow-order";

export const FAULT_KINDS: readonly FaultKind[] = ["signal-hold", "door-fault", "slow-order"] as const;

export interface ActiveFault {
  kind: FaultKind;
  /** Bilingual cause, shown on the strip / spoken by CoSiMo. */
  cause: Record<Locale, string>;
  /** ISO start; `endsAt` is the planned end (it may be cleared earlier). */
  startedAt: string;
  endsAt: string;
  /** Seconds left, recomputed every tick. */
  remainingSec: number;
}

/** One stop of the whole line — the journey view draws all of them. */
export interface LineStop {
  id: string;
  name: Record<Locale, string>;
  /** Seconds of travel from the previous stop (0 for the first). */
  travelSecondsFromPrev: number;
  dwellSeconds: number;
}

export interface MonoCabTelemetry {
  /** km/h. */
  speedKmh: number;
  /** Where the cab is on the line, for the journey view. */
  position: {
    /** Index of the stop the cab is at (dwell/hold at a station) or just left. */
    stopIndex: number;
    /** 0..1 along the leg from `stopIndex` towards the next stop (0 at a station). */
    progress: number;
    /** outbound = first stop → last stop; return = back. */
    direction: "outbound" | "return";
    phase: "dwell" | "drive" | "hold";
  };
  /** The whole line, in outbound order. */
  stops: LineStop[];
  /** Faults currently affecting the journey (usually 0 or 1). */
  faults: ActiveFault[];
  /** Accumulated delay against the timetable since the last terminal, minutes. */
  delayMinutes: number;
  /** Passengers: seats with a live CoSiMo session (the real iPads) vs. the
   *  simulated rest. `occupancy` is their sum, capped at capacity. */
  seats: { liveSessions: number; simulated: number };
  /** Human-readable current location per locale. */
  location: Record<Locale, string>;
  /** Track/line identifier, e.g. "Extertalbahn". */
  line: Record<Locale, string>;
  /** Final destination per locale. */
  destination: Record<Locale, string>;
  /** Upcoming stops in order; first is the next stop. */
  nextStops: RouteStop[];
  /** Passengers currently aboard (mocked). */
  occupancy: number;
  /** Nominal cabin capacity. */
  capacity: number;
  /** Whether doors are currently open. */
  doorsOpen: boolean;
  /** Free-form extras the author can attach (accessibility notes, etc.). */
  notes?: Record<Locale, string>;
  /** True while the journey simulation is paused (host console display). */
  simPaused?: boolean;
}

/** Live telemetry overrides the host can force from the operator console.
 *  Applied INTO the running journey simulation (which owns the state). */
export interface HostTelemetryPatch {
  /** Pause / resume the journey simulation. */
  paused?: boolean;
  occupancy?: number;
  /** Inject a fault now (host demo), with an optional duration in seconds. */
  fault?: { kind: FaultKind; durationSec?: number };
  /** Clear every active fault. */
  clearFaults?: boolean;
}
