/**
 * Cuety LPU-2 dialect — the only place that knows how the cabin's DMX
 * controller is spoken to. It builds ready-made URLs; the kiosk that fires
 * them stays oblivious (see `CabinActuation` in @cosimo/shared).
 *
 * The LPU-2 lives on the air-gapped cabin LAN, so the *iPads* reach it, not
 * this service. HTTP is plain GET on port 80 (`/ajax/…`), fire-and-forget —
 * there is no push feedback, which is why the kiosk reports the outcome.
 *
 * Mapping: one playback (01–64) per catalog key (packages/shared cabin.ts
 * `LPU2_KEYS`), numbers from the CMS. Command style follows the rig's own
 * table: start = `pbXX/go` (runs the programmed cue at its stored levels),
 * stop = `pbXX/re` (release — the standalone/background scene takes over,
 * the cabin is never left dark by our doing). Playbacks are ADDITIVE, so
 * switching a CW/WW zone on means: go on the wanted variant + re on its
 * sibling. `in=0..255` dims a RUNNING playback below its stored maxima
 * (the installer's API sheet: 255 = full — our controls speak 0..100 and
 * are scaled here, the only place that knows the device range); `ju=`
 * jumps to a cue, `fl=` flashes.
 */

import type { CabinActuation, CabinControlId, RigOp } from "@cosimo/shared";

/** Playback per catalog key (see `LPU2_KEYS`); scene controls may carry cue numbers. */
export type Lpu2Mapping = Record<string, { playback: number; cues?: Record<string, number> }>;

export interface Lpu2Config {
  /** Base URL on the cabin LAN — empty = not wired up, everything simulated. */
  baseUrl: string;
  mapping: Lpu2Mapping;
  timeoutMs: number;
}

/** Playbacks are addressed zero-padded to two digits: pb01 … pb64. */
function playback(n: number): string {
  return `pb${String(n).padStart(2, "0")}`;
}

/** Our 0–100 level → the device's 0–255 intensity (installer's API sheet). */
function intensity(level: number): number {
  const pct = Math.max(0, Math.min(100, Number(level) || 0));
  return Math.round((pct / 100) * 255);
}

function ajax(config: Lpu2Config, path: string): string {
  return `${config.baseUrl.replace(/\/+$/, "")}/ajax/${path}`;
}

/** One playback command URL for a mapped key, or null when unmapped. */
function pbUrl(config: Lpu2Config, key: string, cmd: string): string | null {
  const entry = config.mapping[key];
  if (!config.baseUrl || !entry) return null;
  return ajax(config, `${playback(entry.playback)}/${cmd}`);
}

/**
 * Build the actuation for one RIDER control change, or null when nothing is
 * mapped (simulated-only) — the demo then simply runs on-screen.
 *
 * `interior-light` = the rooflight pair: on → warm white `go` + cold white
 * `re` (spoken default is WW; additive playbacks would otherwise mix), off →
 * both `re`. `reading-lamp` = the seat's own playback (`reading-<seat>`),
 * so a seat without a configured number stays simulated.
 */
export function buildActuation(
  control: CabinControlId,
  change: { on?: boolean; level?: number; scene?: string; flash?: true },
  config: Lpu2Config,
  seat?: number,
): CabinActuation | null {
  const urls: string[] = [];
  const push = (u: string | null) => { if (u) urls.push(u); };

  if (control === "interior-light") {
    if (change.level !== undefined) push(pbUrl(config, "interior-light-ww", `in=${intensity(change.level)}`));
    else if (change.on === true) { push(pbUrl(config, "interior-light-ww", "go")); push(pbUrl(config, "interior-light-cw", "re")); }
    else if (change.on === false) { push(pbUrl(config, "interior-light-ww", "re")); push(pbUrl(config, "interior-light-cw", "re")); }
  } else if (control === "reading-lamp") {
    const key = seat && seat >= 1 && seat <= 4 ? `reading-${seat}` : null;
    if (!key) return null;
    if (change.level !== undefined) push(pbUrl(config, key, `in=${intensity(change.level)}`));
    else if (change.on === true) push(pbUrl(config, key, "go"));
    else if (change.on === false) push(pbUrl(config, key, "re"));
  }

  return urls.length ? { control, urls, timeoutMs: config.timeoutMs } : null;
}

/**
 * Host light actions (console buttons): a mapped catalog key toggled on/off
 * (`go`/`re`), or a global — blackout on/off, release-all, hello (the
 * connection test; the actuating iPad reports whether the LPU answered).
 */
export function buildHostLight(
  key: string,
  on: boolean,
  config: Lpu2Config,
): CabinActuation | null {
  if (!config.baseUrl) return null;
  const urls: string[] = [];
  if (key === "blackout") urls.push(ajax(config, `blackout=${on ? 1 : 0}`));
  else if (key === "release-all") urls.push(ajax(config, "release"));
  else if (key === "hello") urls.push(ajax(config, "hello"));
  else {
    const u = pbUrl(config, key, on ? "go" : "re");
    if (u) urls.push(u);
    // A zone's `go` must silence the additive sibling variant.
    const sibling = key.endsWith("-cw") ? key.replace(/-cw$/, "-ww") : key.endsWith("-ww") ? key.replace(/-ww$/, "-cw") : null;
    if (on && u && sibling) { const s = pbUrl(config, sibling, "re"); if (s) urls.push(s); }
  }
  return urls.length ? { control: key, urls, timeoutMs: config.timeoutMs } : null;
}

/**
 * The console's rig page: a list of playback commands (shared rig.ts
 * `rigOps`) → the URLs, in order. Unmapped keys are skipped, so a partly
 * mapped rig still drives what it can; nothing mapped → null.
 */
export function buildRigOps(control: string, ops: RigOp[], config: Lpu2Config): CabinActuation | null {
  if (!config.baseUrl) return null;
  const urls: string[] = [];
  for (const op of ops) {
    const u = pbUrl(config, op.key, op.cmd === "in" ? `in=${intensity(op.level)}` : op.cmd);
    if (u) urls.push(u);
  }
  return urls.length ? { control, urls, timeoutMs: config.timeoutMs } : null;
}
