/**
 * Mock MonoCab telemetry provider. In production this reads the *active*
 * snapshot from Payload's `mockup-data` collection; if Payload is unreachable
 * or has no active snapshot, it falls back to a built-in default so the agent
 * always has something convincing to ground answers in. No real MonoCab
 * integration (out of scope).
 */

import type { MonoCabTelemetry } from "@cosimo/shared";
import { config } from "../config.js";

/** Built-in fallback so the demo works standalone (no Payload, no DB). */
export const DEFAULT_TELEMETRY: MonoCabTelemetry = {
  speedKmh: 28,
  location: { de: "zwischen Lemgo und Dörentrup", en: "between Lemgo and Dörentrup" },
  line: { de: "Extertalbahn", en: "Extertal line" },
  destination: { de: "Rinteln", en: "Rinteln" },
  nextStops: [
    { id: "doerentrup", name: { de: "Dörentrup", en: "Dörentrup" }, etaMinutes: 4 },
    { id: "barntrup", name: { de: "Barntrup", en: "Barntrup" }, etaMinutes: 11 },
    { id: "rinteln", name: { de: "Rinteln", en: "Rinteln" }, etaMinutes: 23 },
  ],
  occupancy: 1,
  capacity: 4,
  batteryPct: 82,
  doorsOpen: false,
  notes: {
    de: "Stufenloser Einstieg, Rollstuhlplatz vorhanden.",
    en: "Step-free boarding, wheelchair space available.",
  },
};

/** Shape of a Payload `mockup-data` document we care about. */
interface PayloadMockupDoc {
  speedKmh?: number;
  batteryPct?: number;
  occupancy?: number;
  capacity?: number;
  doorsOpen?: boolean;
  locationDe?: string;
  locationEn?: string;
  lineDe?: string;
  lineEn?: string;
  destinationDe?: string;
  destinationEn?: string;
  nextStops?: Array<{ id: string; nameDe: string; nameEn: string; etaMinutes: number }>;
  notesDe?: string;
  notesEn?: string;
}

function fromPayload(doc: PayloadMockupDoc): MonoCabTelemetry {
  return {
    speedKmh: doc.speedKmh ?? 0,
    location: { de: doc.locationDe ?? "", en: doc.locationEn ?? "" },
    line: { de: doc.lineDe ?? "", en: doc.lineEn ?? "" },
    destination: { de: doc.destinationDe ?? "", en: doc.destinationEn ?? "" },
    nextStops: (doc.nextStops ?? []).map((s) => ({
      id: s.id,
      name: { de: s.nameDe, en: s.nameEn },
      etaMinutes: s.etaMinutes,
    })),
    occupancy: doc.occupancy ?? 0,
    capacity: doc.capacity ?? 4,
    batteryPct: doc.batteryPct ?? 100,
    doorsOpen: doc.doorsOpen ?? false,
    notes:
      doc.notesDe || doc.notesEn
        ? { de: doc.notesDe ?? "", en: doc.notesEn ?? "" }
        : undefined,
  };
}

/**
 * Telemetry source: caches the active snapshot, refreshing from Payload on a
 * short TTL. Synchronous reads return the last good value (or the default).
 */
export class TelemetryProvider {
  private current: MonoCabTelemetry = DEFAULT_TELEMETRY;
  private lastFetch = 0;
  private readonly ttlMs = 10_000;

  /** Last-known telemetry, always available (never throws). */
  get(): MonoCabTelemetry {
    return this.current;
  }

  /** Refresh from Payload's active `mockup-data` snapshot, best-effort. */
  async refresh(): Promise<MonoCabTelemetry> {
    const now = Date.now();
    if (now - this.lastFetch < this.ttlMs) return this.current;
    this.lastFetch = now;
    try {
      const url = `${config.payload.internalUrl}/api/mockup-data?where[active][equals]=true&limit=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return this.current;
      const body = (await res.json()) as { docs?: PayloadMockupDoc[] };
      const doc = body.docs?.[0];
      if (doc) this.current = fromPayload(doc);
    } catch {
      // Payload down / no data — keep last-known (or default).
    }
    return this.current;
  }
}
