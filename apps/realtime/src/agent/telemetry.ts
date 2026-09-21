/**
 * MonoCab journey simulation. Instead of hand-flipped telemetry snapshots,
 * a small state machine drives the line from the first stop to the last and
 * back again (ping-pong), forever: cruise between stops (with accel/decel
 * ramps), dwell with open doors at each stop, turn around at the terminals.
 * Telemetry (speed, position, ETAs, doors, occupancy) is *derived*
 * from the simulation clock each tick.
 *
 * The route (stops, leg travel times, dwell times, cruise speed, per-stop
 * passenger demand) is authored in Payload's
 * `route-config` global and refreshed on a TTL — an operator edit resets the
 * journey to the start of the new route. If Payload is unreachable the
 * built-in Begatalbahn route keeps the demo alive.
 *
 * Faults are first-class state: a signal hold parks the cab between
 * stations, a door fault extends the dwell, a slow order reduces cruise
 * speed. They come ONLY from the host (the console's Fahrt card), end on
 * their own, are visible to CoSiMo through get_telemetry and to the journey
 * view through telemetry:update, and are logged.
 *
 * The host console can pause/resume the journey and set the occupancy;
 * those land INSIDE the simulation state, so they persist (no snapshot loop
 * overwrites them). No real MonoCab integration (out of scope).
 */

import type {
  ActiveFault,
  FaultKind,
  HostTelemetryPatch,
  Locale,
  MonoCabTelemetry,
} from "@cosimo/shared";
import { config } from "../config.js";
import { logger } from "../log/logger.js";

export interface SimStop {
  id: string;
  name: Record<Locale, string>;
  /** Seconds to travel here from the previous stop (0 for the first). */
  travelSecondsFromPrev: number;
  /** Seconds the cab waits here with open doors. */
  dwellSeconds: number;
  /** How busy the stop is, 0–5: expected boardings per call (alightings follow). */
  demand: number;
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
  // Begatalbahn Brake (Lemgo) – Barntrup, the five MonoCab stops of
  // Ausbaustufe 1 from the project's stop GeoJSON (HS02, 13, 15, 17, 21;
  // 2026-09-21). Leg times: air-line distance × 1.08 for the track's bends,
  // at cruise speed, plus 15 s for the ramps. Lemgo-Lüttfeld (HS01) is not
  // connected in any stage.
  line: { de: "Begatalbahn", en: "Bega valley line" },
  stops: [
    { id: "brake-bahnhof", name: { de: "Brake (Lemgo) Bahnhof", en: "Brake (Lemgo) station" }, travelSecondsFromPrev: 0, dwellSeconds: 90, demand: 3 },
    { id: "doerentrup-dammstrasse", name: { de: "Dörentrup Dammstraße", en: "Dörentrup Dammstraße" }, travelSecondsFromPrev: 460, dwellSeconds: 45, demand: 2 },
    { id: "farmbeck-bahnhof", name: { de: "Farmbeck Bahnhof", en: "Farmbeck station" }, travelSecondsFromPrev: 150, dwellSeconds: 45, demand: 1 },
    { id: "bega-bahnhof", name: { de: "Bega Bahnhof", en: "Bega station" }, travelSecondsFromPrev: 190, dwellSeconds: 45, demand: 2 },
    { id: "barntrup-bahnhof", name: { de: "Barntrup Bahnhof", en: "Barntrup station" }, travelSecondsFromPrev: 350, dwellSeconds: 90, demand: 3 },
  ],
  cruiseSpeedKmh: 55,
  capacity: 4,
  notes: {
    de: "Stufenloser Einstieg, Rollstuhlplatz vorhanden.",
    en: "Step-free boarding, wheelchair space available.",
  },
};

/** Fraction of a leg spent accelerating / braking (speed ramp). */
const RAMP = 0.15;

/** Speed factor while a slow order is active. */
const SLOW_FACTOR: Partial<Record<FaultKind, number>> = { "slow-order": 0.4 };

/** Default durations when the host injects without one. */
const DEFAULT_FAULT_SEC: Record<FaultKind, number> = {
  "signal-hold": 45,
  "door-fault": 30,
  "slow-order": 120,
};

const FAULT_CAUSE: Record<FaultKind, Record<Locale, string>> = {
  "signal-hold": { de: "Halt vor Signal – wir warten auf Fahrtfreigabe.", en: "Held at a signal – waiting for clearance." },
  "door-fault": { de: "Türstörung – die Türen bleiben noch offen.", en: "Door fault – the doors stay open a little longer." },
  "slow-order": { de: "Langsamfahrstelle – wir fahren vorübergehend langsamer.", en: "Slow order – temporarily reduced speed." },
};

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
    demand?: number | null;
  }>;
}

function routeFromPayload(doc: PayloadRouteDoc): SimRoute | null {
  const stops: SimStop[] = (doc.stops ?? []).map((s, i) => ({
    id: s.stopId ?? `stop-${i}`,
    name: { de: s.nameDe ?? "", en: s.nameEn ?? s.nameDe ?? "" },
    travelSecondsFromPrev: i === 0 ? 0 : Math.max(10, s.travelSecondsFromPrev ?? 60),
    dwellSeconds: Math.max(5, s.dwellSeconds ?? 45),
    demand: clamp(Math.round(s.demand ?? 2), 0, 5),
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

interface Fault {
  kind: FaultKind;
  startedAt: number;
  endsAt: number;
  by: "host";
  /** Set when the host ended it early (its fault.end is logged there). */
  cleared?: boolean;
}

export class TelemetrySimulation {
  private route: SimRoute = DEFAULT_ROUTE;
  private routeJson = JSON.stringify(DEFAULT_ROUTE);
  private lastFetch = 0;
  private readonly ttlMs = 30_000;

  // Journey state. `phase: dwell` = at stops[idx]; `phase: drive` = under way
  // from stops[idx] towards stops[idx + direction]. A hold parks the drive.
  private phase: "dwell" | "drive" = "dwell";
  private idx = 0;
  private direction: 1 | -1 = 1;
  private phaseStart: number;
  private paused = false;
  private pausedAt = 0;
  /** Simulated passengers (the real seats are added by the hub). */
  private simulated = 1;
  /** Seats with a live CoSiMo session right now — set by the hub each tick. */
  private liveSessions = 0;

  private readonly faults: Fault[] = [];
  /** Delay against the timetable since the last terminal, in ms. */
  private delayMs = 0;
  /** Where the drive progress stood when a hold began (it freezes). */
  private holdProgress = 0;

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

  private active(kind: FaultKind, now: number): Fault | undefined {
    return this.faults.find((f) => f.kind === kind && f.endsAt > now);
  }

  /** The factor cruise speed is multiplied by under the active faults. */
  private speedFactor(now: number): number {
    let f = 1;
    for (const fault of this.faults) {
      if (fault.endsAt <= now) continue;
      f = Math.min(f, SLOW_FACTOR[fault.kind] ?? 1);
    }
    return f;
  }

  /** Tell the sim how many real seats have a live session (hub, per tick). */
  setLiveSessions(n: number): void {
    this.liveSessions = Math.max(0, n);
  }

  /** Start a fault now. Duplicate kinds extend rather than stack. */
  injectFault(kind: FaultKind, durationSec: number | undefined, by: Fault["by"], now: number = Date.now()): void {
    const sec = Math.max(5, durationSec ?? DEFAULT_FAULT_SEC[kind]);
    const existing = this.active(kind, now);
    if (existing) {
      existing.endsAt = Math.max(existing.endsAt, now + sec * 1000);
      return;
    }
    this.update(now); // settle the journey up to this moment first
    // A hold between stations freezes the drive where it is; everything
    // else just changes the rules while the clock keeps running.
    if (kind === "signal-hold" && this.phase === "drive") {
      const legMs = this.legSeconds(this.idx, this.direction) * 1000;
      this.holdProgress = clamp((now - this.phaseStart) / legMs, 0, 1);
    }
    this.faults.push({ kind, startedAt: now, endsAt: now + sec * 1000, by });
    logger.log("fault.start", { fault: kind, durationSec: sec, by });
  }

  /** End every active fault now (host). */
  clearFaults(now: number = Date.now()): void {
    for (const f of this.faults) {
      if (f.endsAt > now) {
        f.endsAt = now;
        f.cleared = true;
        logger.log("fault.end", { fault: f.kind, by: "host" });
      }
    }
    this.expire(now);
  }

  /** Drop finished faults, pushing the journey clock for the time they cost. */
  private expire(now: number): void {
    for (let i = this.faults.length - 1; i >= 0; i--) {
      const f = this.faults[i]!;
      if (f.endsAt > now) continue;
      const costMs = f.endsAt - f.startedAt;
      // A hold or a door fault stalls the journey for its whole duration: the
      // phase clock moves forward by that much, and the timetable slips.
      if (f.kind === "signal-hold" || f.kind === "door-fault") {
        this.phaseStart += costMs;
        this.delayMs += costMs;
      }
      // Host-cleared faults logged their end in clearFaults; the rest ran out.
      if (!f.cleared) logger.log("fault.end", { fault: f.kind, by: "elapsed" });
      this.faults.splice(i, 1);
    }
  }

  /** True while a fault parks the journey clock (hold / door fault). */
  private stalled(now: number): boolean {
    return Boolean(this.active("signal-hold", now) && this.phase === "drive") ||
      Boolean(this.active("door-fault", now) && this.phase === "dwell");
  }

  /** Advance the state machine to `now`, consuming any completed phases. */
  update(now: number = Date.now()): void {
    if (this.paused) return;
    this.expire(now);
    if (this.stalled(now)) return; // the clock is parked until the fault ends
    for (;;) {
      const elapsed = now - this.phaseStart;
      if (this.phase === "dwell") {
        const durMs = (this.route.stops[this.idx]?.dwellSeconds ?? 45) * 1000;
        if (elapsed < durMs) return;
        this.phaseStart += durMs;
        this.phase = "drive";
      } else {
        const legSec = this.legSeconds(this.idx, this.direction) / this.speedFactor(now);
        const durMs = legSec * 1000;
        if (elapsed < durMs) return;
        // Arrive at the next stop.
        this.phaseStart += durMs;
        this.idx += this.direction;
        this.phase = "dwell";
        this.board(this.idx);
        if (this.isTerminal(this.idx)) {
          // Turnaround: flip direction, reset the timetable.
          this.direction = this.direction === 1 ? -1 : 1;
          this.delayMs = 0;
        }
      }
    }
  }

  /**
   * Passengers get on and off while the doors are open. Alightings are a
   * share of those aboard (everyone leaves at a terminal); boardings follow
   * the stop's demand, bounded by the seats the real riders aren't using.
   */
  private board(stopIdx: number): void {
    const stop = this.route.stops[stopIdx];
    const demand = stop?.demand ?? 2;
    const terminal = this.isTerminal(stopIdx);
    const alight = terminal ? this.simulated : Math.round(this.simulated * (0.2 + Math.random() * 0.4));
    const boarding = Math.round(demand * (0.4 + Math.random() * 0.9));
    const free = Math.max(0, this.route.capacity - this.liveSessions);
    this.simulated = clamp(this.simulated - alight + boarding, 0, free);
  }

  /** Derive the current telemetry snapshot (call update() first). */
  get(now: number = Date.now()): MonoCabTelemetry {
    const stops = this.route.stops;
    const terminal = this.direction === 1 ? stops[stops.length - 1] : stops[0];
    const here = stops[this.idx];
    const effectiveNow = this.paused ? this.pausedAt : now;
    const elapsed = effectiveNow - this.phaseStart;
    const hold = this.active("signal-hold", effectiveNow);
    const doorFault = this.active("door-fault", effectiveNow);

    let speedKmh = 0;
    let doorsOpen = false;
    let location: Record<Locale, string>;
    /** ms until arrival at the stop the cab reaches next. */
    let msToNextArrival: number;
    let progress = 0;
    let phase: MonoCabTelemetry["position"]["phase"] = "dwell";
    let departsInSec: number | undefined;
    const nextIdx = this.idx + this.direction;
    const legSec = this.legSeconds(this.idx, this.direction) / this.speedFactor(effectiveNow);

    if (this.phase === "dwell") {
      doorsOpen = true;
      location = {
        de: `Bahnhof ${here?.name.de ?? ""}`,
        en: `${here?.name.en ?? ""} station`,
      };
      const dwellMs = (here?.dwellSeconds ?? 45) * 1000;
      const dwellLeft = doorFault
        ? Math.max(0, dwellMs - elapsed) + (doorFault.endsAt - effectiveNow)
        : Math.max(0, dwellMs - elapsed);
      msToNextArrival = dwellLeft + legSec * 1000;
      departsInSec = Math.ceil(dwellLeft / 1000);
      if (doorFault) phase = "hold";
    } else {
      const to = stops[nextIdx];
      const legMs = legSec * 1000;
      if (hold) {
        // Parked between stations: no speed, progress frozen, ETA = the rest
        // of the hold plus the rest of the leg.
        progress = this.holdProgress;
        phase = "hold";
        msToNextArrival = hold.endsAt - effectiveNow + Math.max(0, legMs * (1 - progress));
      } else {
        progress = clamp(elapsed / legMs, 0, 1);
        const ramp = clamp(Math.min(progress / RAMP, (1 - progress) / RAMP), 0, 1);
        speedKmh = Math.round(this.route.cruiseSpeedKmh * this.speedFactor(effectiveNow) * ramp);
        phase = "drive";
        msToNextArrival = Math.max(0, legMs - elapsed);
      }
      location = {
        de: `zwischen ${here?.name.de ?? ""} und ${to?.name.de ?? ""}`,
        en: `between ${here?.name.en ?? ""} and ${to?.name.en ?? ""}`,
      };
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

    const faults: ActiveFault[] = this.faults
      .filter((f) => f.endsAt > effectiveNow)
      .map((f) => ({
        kind: f.kind,
        cause: FAULT_CAUSE[f.kind],
        startedAt: new Date(f.startedAt).toISOString(),
        endsAt: new Date(f.endsAt).toISOString(),
        remainingSec: Math.max(0, Math.round((f.endsAt - effectiveNow) / 1000)),
      }));

    // A running stall counts towards the delay already (the slip is real now).
    let delayMs = this.delayMs;
    for (const f of this.faults) {
      if (f.endsAt > effectiveNow && (f.kind === "signal-hold" || f.kind === "door-fault")) {
        delayMs += effectiveNow - f.startedAt;
      }
    }

    const simulated = clamp(this.simulated, 0, Math.max(0, this.route.capacity - this.liveSessions));
    return {
      speedKmh,
      position: {
        stopIndex: this.idx,
        progress,
        direction: this.direction === 1 ? "outbound" : "return",
        phase,
        ...(departsInSec !== undefined ? { departsInSec } : {}),
      },
      stops: stops.map((s) => ({
        id: s.id,
        name: s.name,
        travelSecondsFromPrev: s.travelSecondsFromPrev,
        dwellSeconds: s.dwellSeconds,
      })),
      faults,
      delayMinutes: Math.round(delayMs / 60_000),
      seats: { liveSessions: this.liveSessions, simulated },
      location,
      line: this.route.line,
      destination: terminal?.name ?? { de: "", en: "" },
      nextStops,
      occupancy: clamp(this.liveSessions + simulated, 0, this.route.capacity),
      capacity: this.route.capacity,
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
      // exactly where it stopped — faults included.
      const pausedFor = now - this.pausedAt;
      this.phaseStart += pausedFor;
      for (const f of this.faults) {
        f.startedAt += pausedFor;
        f.endsAt += pausedFor;
      }
      this.paused = false;
    }
    if (typeof patch.occupancy === "number") {
      // The host sets total occupancy; the real seats are what they are.
      this.simulated = clamp(Math.round(patch.occupancy) - this.liveSessions, 0, this.route.capacity);
    }
    if (patch.clearFaults) this.clearFaults(now);
    if (patch.fault) this.injectFault(patch.fault.kind, patch.fault.durationSec, "host", now);
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
            this.faults.length = 0;
            this.delayMs = 0;
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
