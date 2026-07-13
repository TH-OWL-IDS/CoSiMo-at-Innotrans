/**
 * MonoCab journey simulation. Instead of hand-flipped telemetry snapshots,
 * a small state machine drives the line from the first stop to the last and
 * back again (ping-pong), forever: cruise between stops (with accel/decel
 * ramps), dwell with open doors at each stop, turn around at the terminals.
 * Telemetry (speed, location, ETAs, doors, battery, occupancy) is *derived*
 * from the simulation clock each tick.
 *
 * The route (stops, leg travel times, dwell times, cruise speed) is authored
 * in Payload's `route-config` global and refreshed on a TTL — an operator
 * edit resets the journey to the start of the new route. If Payload is
 * unreachable the built-in Extertalbahn route keeps the demo alive.
 *
 * The host console can pause/resume the journey and set battery/occupancy;
 * those land INSIDE the simulation state, so they persist (no snapshot loop
 * overwrites them). No real MonoCab integration (out of scope).
 */

import type { HostTelemetryPatch, Locale, MonoCabTelemetry } from "@cosimo/shared";
import { config } from "../config.js";

export interface SimStop {
  id: string;
  name: Record<Locale, string>;
  /** Seconds to travel here from the previous stop (0 for the first). */
  travelSecondsFromPrev: number;
  /** Seconds the cab waits here with open doors. */
  dwellSeconds: number;
}

export interface SimRoute {
  line: Record<Locale, string>;
  stops: SimStop[];
  cruiseSpeedKmh: number;
  capacity: number;
  notes?: Record<Locale, string>;
}

/** Built-in fallback route so the demo works standalone (no Payload, no DB). */
export const DEFAULT_ROUTE: SimRoute = {
  line: { de: "Extertalbahn", en: "Extertal line" },
  stops: [
    { id: "lemgo", name: { de: "Lemgo", en: "Lemgo" }, travelSecondsFromPrev: 0, dwellSeconds: 90 },
    { id: "doerentrup", name: { de: "Dörentrup", en: "Dörentrup" }, travelSecondsFromPrev: 240, dwellSeconds: 45 },
    { id: "barntrup", name: { de: "Barntrup", en: "Barntrup" }, travelSecondsFromPrev: 420, dwellSeconds: 45 },
    { id: "rinteln", name: { de: "Rinteln", en: "Rinteln" }, travelSecondsFromPrev: 720, dwellSeconds: 90 },
  ],
  cruiseSpeedKmh: 55,
  capacity: 4,
  notes: {
    de: "Stufenloser Einstieg, Rollstuhlplatz vorhanden.",
    en: "Step-free boarding, wheelchair space available.",
  },
};

/** Battery: drained per driving minute, lump-recharged at each terminal. */
const DRAIN_PCT_PER_DRIVE_MIN = 0.8;
const TERMINAL_RECHARGE_PCT = 25;

/** Fraction of a leg spent accelerating / braking (speed ramp). */
const RAMP = 0.15;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Shape of the Payload `route-config` global we care about. */
interface PayloadRouteDoc {
  lineDe?: string;
  lineEn?: string;
  cruiseSpeedKmh?: number;
  capacity?: number;
  notesDe?: string;
  notesEn?: string;
  stops?: Array<{
    stopId?: string;
    nameDe?: string;
    nameEn?: string;
    travelSecondsFromPrev?: number;
    dwellSeconds?: number;
  }>;
}

function routeFromPayload(doc: PayloadRouteDoc): SimRoute | null {
  const stops: SimStop[] = (doc.stops ?? []).map((s, i) => ({
    id: s.stopId ?? `stop-${i}`,
    name: { de: s.nameDe ?? "", en: s.nameEn ?? s.nameDe ?? "" },
    travelSecondsFromPrev: i === 0 ? 0 : Math.max(10, s.travelSecondsFromPrev ?? 60),
    dwellSeconds: Math.max(5, s.dwellSeconds ?? 45),
  }));
  if (stops.length < 2) return null; // a journey needs at least two stops
  return {
    line: { de: doc.lineDe ?? "", en: doc.lineEn ?? doc.lineDe ?? "" },
    stops,
    cruiseSpeedKmh: doc.cruiseSpeedKmh && doc.cruiseSpeedKmh > 0 ? doc.cruiseSpeedKmh : 55,
    capacity: doc.capacity && doc.capacity > 0 ? doc.capacity : 4,
    notes:
      doc.notesDe || doc.notesEn
        ? { de: doc.notesDe ?? "", en: doc.notesEn ?? "" }
        : undefined,
  };
}

export class TelemetrySimulation {
  private route: SimRoute = DEFAULT_ROUTE;
  private routeJson = JSON.stringify(DEFAULT_ROUTE);
  private lastFetch = 0;
  private readonly ttlMs = 30_000;

  // Journey state. `phase: dwell` = at stops[idx]; `phase: drive` = under way
  // from stops[idx] towards stops[idx + direction].
  private phase: "dwell" | "drive" = "dwell";
  private idx = 0;
  private direction: 1 | -1 = 1;
  private phaseStart: number;
  private paused = false;
  private pausedAt = 0;
  private batteryPct = 92;
  private occupancy = 1;

  constructor(now: number = Date.now()) {
    this.phaseStart = now;
  }

  /** Seconds for the leg leaving `from` in `dir` (travel times are symmetric). */
  private legSeconds(from: number, dir: 1 | -1): number {
    const s = dir === 1 ? this.route.stops[from + 1] : this.route.stops[from];
    return s?.travelSecondsFromPrev ?? 60;
  }

  private isTerminal(i: number): boolean {
    return i === 0 || i === this.route.stops.length - 1;
  }

  /** Advance the state machine to `now`, consuming any completed phases. */
  update(now: number = Date.now()): void {
    if (this.paused) return;
    for (;;) {
      const elapsed = now - this.phaseStart;
      if (this.phase === "dwell") {
        const durMs = (this.route.stops[this.idx]?.dwellSeconds ?? 45) * 1000;
        if (elapsed < durMs) return;
        this.phaseStart += durMs;
        this.phase = "drive";
      } else {
        const legSec = this.legSeconds(this.idx, this.direction);
        const durMs = legSec * 1000;
        if (elapsed < durMs) return;
        // Arrive at the next stop.
        this.phaseStart += durMs;
        this.idx += this.direction;
        this.phase = "dwell";
        this.batteryPct = clamp(this.batteryPct - (legSec / 60) * DRAIN_PCT_PER_DRIVE_MIN, 5, 100);
        // Passengers get on and off while the doors are open.
        this.occupancy = clamp(
          this.occupancy + (Math.floor(Math.random() * 5) - 2),
          0,
          this.route.capacity,
        );
        if (this.isTerminal(this.idx)) {
          // Turnaround: flip direction and top the battery up at the terminal.
          this.direction = this.direction === 1 ? -1 : 1;
          this.batteryPct = clamp(this.batteryPct + TERMINAL_RECHARGE_PCT, 5, 100);
        }
      }
    }
  }

  /** Derive the current telemetry snapshot (call update() first). */
  get(now: number = Date.now()): MonoCabTelemetry {
    const stops = this.route.stops;
    const terminal = this.direction === 1 ? stops[stops.length - 1] : stops[0];
    const here = stops[this.idx];
    const effectiveNow = this.paused ? this.pausedAt : now;
    const elapsed = effectiveNow - this.phaseStart;

    let speedKmh = 0;
    let doorsOpen = false;
    let location: Record<Locale, string>;
    /** ms until arrival at the stop the cab reaches next. */
    let msToNextArrival: number;
    const nextIdx = this.idx + this.direction;

    if (this.phase === "dwell") {
      doorsOpen = true;
      location = {
        de: `Bahnhof ${here?.name.de ?? ""}`,
        en: `${here?.name.en ?? ""} station`,
      };
      const dwellMs = (here?.dwellSeconds ?? 45) * 1000;
      msToNextArrival =
        Math.max(0, dwellMs - elapsed) + this.legSeconds(this.idx, this.direction) * 1000;
    } else {
      const to = stops[nextIdx];
      const legMs = this.legSeconds(this.idx, this.direction) * 1000;
      const p = clamp(elapsed / legMs, 0, 1);
      const ramp = clamp(Math.min(p / RAMP, (1 - p) / RAMP), 0, 1);
      speedKmh = Math.round(this.route.cruiseSpeedKmh * ramp);
      location = {
        de: `zwischen ${here?.name.de ?? ""} und ${to?.name.de ?? ""}`,
        en: `between ${here?.name.en ?? ""} and ${to?.name.en ?? ""}`,
      };
      msToNextArrival = Math.max(0, legMs - elapsed);
    }

    // Accumulate ETAs stop by stop until the terminal (inclusive).
    const nextStops: MonoCabTelemetry["nextStops"] = [];
    let acc = msToNextArrival;
    for (let i = nextIdx; i >= 0 && i < stops.length; i += this.direction) {
      const s = stops[i];
      if (!s) break;
      nextStops.push({
        id: s.id,
        name: s.name,
        etaMinutes: Math.max(0, Math.round(acc / 60_000)),
      });
      if (this.isTerminal(i)) break;
      acc += s.dwellSeconds * 1000 + this.legSeconds(i, this.direction) * 1000;
    }

    return {
      speedKmh,
      location,
      line: this.route.line,
      destination: terminal?.name ?? { de: "", en: "" },
      nextStops,
      occupancy: this.occupancy,
      capacity: this.route.capacity,
      batteryPct: Math.round(this.batteryPct),
      doorsOpen,
      notes: this.route.notes,
      ...(this.paused ? { simPaused: true } : {}),
    };
  }

  /** Host console overrides — land inside the simulation, so they persist. */
  applyPatch(patch: HostTelemetryPatch, now: number = Date.now()): void {
    if (patch.paused === true && !this.paused) {
      this.update(now); // settle up to the pause moment first
      this.paused = true;
      this.pausedAt = now;
    } else if (patch.paused === false && this.paused) {
      // Shift the phase clock by the pause duration so the journey resumes
      // exactly where it stopped.
      this.phaseStart += now - this.pausedAt;
      this.paused = false;
    }
    if (typeof patch.batteryPct === "number") this.batteryPct = clamp(patch.batteryPct, 0, 100);
    if (typeof patch.occupancy === "number")
      this.occupancy = clamp(Math.round(patch.occupancy), 0, this.route.capacity);
  }

  /** Refresh the route from Payload (TTL), advance the sim, return telemetry.
   *  A route change restarts the journey at the new first stop. Never throws. */
  async refresh(now: number = Date.now()): Promise<MonoCabTelemetry> {
    if (now - this.lastFetch >= this.ttlMs) {
      this.lastFetch = now;
      try {
        const url = `${config.payload.internalUrl}/api/globals/route-config`;
        const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const doc = (await res.json()) as PayloadRouteDoc;
          const route = routeFromPayload(doc);
          const json = route ? JSON.stringify(route) : null;
          if (route && json && json !== this.routeJson) {
            this.route = route;
            this.routeJson = json;
            this.phase = "dwell";
            this.idx = 0;
            this.direction = 1;
            this.phaseStart = now;
          }
        }
      } catch {
        // Payload down — keep driving the last-known route.
      }
    }
    this.update(now);
    return this.get(now);
  }
}
