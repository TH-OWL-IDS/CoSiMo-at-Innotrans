/**
 * Mocked MonoCab telemetry. This is the shape CoSiMo reads from to answer
 * questions ("how fast are we going?", "when do we arrive?"). It is sourced
 * from the hand-authored `mockup-data` collection — there is no real MonoCab
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

export interface MonoCabTelemetry {
  /** km/h. */
  speedKmh: number;
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
  /** Battery state of charge, 0..100. */
  batteryPct: number;
  /** Whether doors are currently open. */
  doorsOpen: boolean;
  /** Free-form extras the author can attach (accessibility notes, etc.). */
  notes?: Record<Locale, string>;
}
