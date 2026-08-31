/**
 * Cuety LPU-2 dialect — the only place that knows how the cabin's DMX
 * controller is spoken to. It builds ready-made URLs; the kiosk that fires
 * them stays oblivious (see `CabinActuation` in @cosimo/shared).
 *
 * The LPU-2 lives on the air-gapped cabin LAN, so the *iPads* reach it, not
 * this service. HTTP is plain GET on port 80 (`/ajax/…`), fire-and-forget —
 * there is no push feedback, which is why the kiosk reports the outcome.
 *
 * Mapping: one playback (01–64) per cabin control, configured in the CMS.
 *   toggle on   → pbXX/in=100     level → pbXX/in=<0..100>
 *   toggle off  → pbXX/re (release, so the standalone scene resumes)
 *   scene       → pbXX/ju=<cue>   (cue 1–48; the CMS maps scene key → cue)
 *   flash       → pbXX/fl=1       (momentary; the device does the timing)
 * Intensity is native to the device, so a dimmable control needs no extra
 * plumbing. `/ajax/hello` is the health ping.
 */

import type { CabinActuation, CabinControlId } from "@cosimo/shared";

/** Which playback drives which cabin control; scene controls also carry
 *  their cue numbers (scene key → cue 1–48). */
export type Lpu2Mapping = Partial<Record<CabinControlId, { playback: number; cues?: Record<string, number> }>>;

export interface Lpu2Config {
  /** Base URL on the cabin LAN, e.g. http://10.0.0.50 — empty = not wired up. */
  baseUrl: string;
  mapping: Lpu2Mapping;
  timeoutMs: number;
}

/** Playbacks are addressed zero-padded to two digits: pb01 … pb64. */
function playback(n: number): string {
  return `pb${String(n).padStart(2, "0")}`;
}

/** Clamp an intensity to what the device accepts (0–100). */
function intensity(level: number): number {
  return Math.max(0, Math.min(100, Math.round(level)));
}

/**
 * Build the actuation for one control change, or null when this control has no
 * playback configured (simulated-only) or the controller isn't set up at all —
 * in which case the demo simply runs on-screen, as it does today.
 */
export function buildActuation(
  control: CabinControlId,
  change: { on?: boolean; level?: number; scene?: string; flash?: true },
  config: Lpu2Config,
): CabinActuation | null {
  const entry = config.mapping[control];
  if (!config.baseUrl || !entry) return null;

  const base = `${config.baseUrl.replace(/\/+$/, "")}/ajax/${playback(entry.playback)}`;
  const urls: string[] = [];
  if (change.flash) urls.push(`${base}/fl=1`);
  else if (change.scene !== undefined) {
    // Unknown scene key or unmapped cue → simulated only, never a bad jump.
    const cue = entry.cues?.[change.scene];
    if (cue !== undefined) urls.push(`${base}/ju=${cue}`);
  } else if (change.level !== undefined) urls.push(`${base}/in=${intensity(change.level)}`);
  else if (change.on === true) urls.push(`${base}/in=100`);
  // Release rather than in=0: the playback lets go and the LPU-2's standalone
  // scene takes over again — the cabin is never left dark by our doing.
  else if (change.on === false) urls.push(`${base}/re`);

  return urls.length ? { control, urls, timeoutMs: config.timeoutMs } : null;
}
