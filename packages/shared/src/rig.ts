import type { HostLightGlobal } from "./cabin.js";

/**
 * The light rig as the installer's own control page models it (MESO,
 * `lighting-test.html`, 2026-09-18) — the console's "Steuern" page rebuilds
 * that page on our infrastructure (address + playbacks from the CMS, the
 * hub builds the URLs, an iPad in the cabin LAN fires them).
 *
 *  - paired fixtures (a cold-white and a warm-white playback): one master
 *    intensity, one CW/WW bias; on = `go` on both + the split levels,
 *    off = `re` on both;
 *  - single-channel fixtures (the reading lamps): intensity only;
 *  - the signal light: a CW/WW pair + RGB playbacks scaled by the master +
 *    four mutually exclusive mode playbacks (one `go`, the others `re`).
 *
 * Levels are 0–100 here (the device wants 0–255 — lpu2.ts scales). The
 * fixture ids are ours; the playback KEYS are the CMS catalog keys
 * (`LPU2_KEYS`), so a re-patched rig is one CMS edit away.
 */

export interface RigMode { key: string; label: string }

export type RigFixture =
  | { id: string; label: string; kind: "pair"; cw: string; ww: string }
  | { id: string; label: string; kind: "single"; key: string }
  | { id: string; label: string; kind: "combined"; cw: string; ww: string; rgb: { red: string; green: string; blue: string }; modes: RigMode[] };

export const RIG_FIXTURES: RigFixture[] = [
  { id: "outer", label: "Außenlicht", kind: "pair", cw: "outer-cw", ww: "outer-ww" },
  { id: "floor", label: "Bodenlicht", kind: "pair", cw: "floor-cw", ww: "floor-ww" },
  { id: "roofline", label: "Lichtlinien", kind: "pair", cw: "roofline-cw", ww: "roofline-ww" },
  { id: "rooflight", label: "Deckenpaneel", kind: "pair", cw: "interior-light-cw", ww: "interior-light-ww" },
  { id: "headrests", label: "Kopfstützen", kind: "pair", cw: "headrests-cw", ww: "headrests-ww" },
  { id: "reading-1", label: "Leselampe 1 (vorn)", kind: "single", key: "reading-1" },
  { id: "reading-2", label: "Leselampe 2 (Mitte vorn)", kind: "single", key: "reading-2" },
  { id: "reading-3", label: "Leselampe 3 (Mitte hinten)", kind: "single", key: "reading-3" },
  { id: "reading-4", label: "Leselampe 4 (hinten)", kind: "single", key: "reading-4" },
  {
    id: "signals", label: "Signallicht", kind: "combined", cw: "signals-cw", ww: "signals-ww",
    rgb: { red: "signals-red", green: "signals-green", blue: "signals-blue" },
    modes: [
      { key: "signals-front-red", label: "vorn rot" },
      { key: "signals-rear-red", label: "hinten rot" },
      { key: "signals-front-flash", label: "vorn blinkend" },
      { key: "signals-rear-flash", label: "hinten blinkend" },
    ],
  },
];

/** The live state of one fixture, as the console last set it (hub-held). */
export interface RigFixtureState {
  on: boolean;
  /** Master intensity 0–100. */
  intensity: number;
  /** CW/WW bias −100 … 100: 0 = both channels at the master, +x reduces
   *  warm white by x %, −x reduces cold white. Pairs and combined only. */
  bias: number;
  /** RGB levels 0–100, scaled by the master. Combined only. */
  rgb?: { red: number; green: number; blue: number };
  /** The active exclusive mode's key. Combined only. */
  mode?: string | null;
}

export function rigDefaultState(f: RigFixture): RigFixtureState {
  return {
    on: false, intensity: 100, bias: 0,
    ...(f.kind === "combined" ? { rgb: { red: 0, green: 0, blue: 0 }, mode: null } : {}),
  };
}

/** One playback command; `in` carries our 0–100 level. */
export type RigOp = { key: string; cmd: "go" | "re" } | { key: string; cmd: "in"; level: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** The installer's split: the bias only ever reduces the opposite channel. */
export function splitBias(total: number, bias: number): { cw: number; ww: number } {
  const t = clamp(total, 0, 100);
  const b = clamp(bias, -100, 100) / 100;
  return {
    cw: Math.round(t * (b >= 0 ? 1 : 1 + b)),
    ww: Math.round(t * (b <= 0 ? 1 : 1 - b)),
  };
}

/** Every playback the fixture owns, modes excluded. */
export function rigChannels(f: RigFixture): string[] {
  if (f.kind === "single") return [f.key];
  if (f.kind === "combined") return [f.cw, f.ww, f.rgb.red, f.rgb.green, f.rgb.blue];
  return [f.cw, f.ww];
}

/** The `in=` commands for the fixture's current levels. */
export function rigLevelOps(f: RigFixture, s: RigFixtureState): RigOp[] {
  if (f.kind === "single") return [{ key: f.key, cmd: "in", level: clamp(s.intensity, 0, 100) }];
  const { cw, ww } = splitBias(s.intensity, s.bias);
  const ops: RigOp[] = [{ key: f.cw, cmd: "in", level: cw }, { key: f.ww, cmd: "in", level: ww }];
  if (f.kind === "combined") {
    const master = clamp(s.intensity, 0, 100) / 100;
    const rgb = s.rgb ?? { red: 0, green: 0, blue: 0 };
    ops.push(
      { key: f.rgb.red, cmd: "in", level: Math.round(master * clamp(rgb.red, 0, 100)) },
      { key: f.rgb.green, cmd: "in", level: Math.round(master * clamp(rgb.green, 0, 100)) },
      { key: f.rgb.blue, cmd: "in", level: Math.round(master * clamp(rgb.blue, 0, 100)) },
    );
  }
  return ops;
}

/**
 * The commands for a console action, exactly as the installer's page sends
 * them: on = `go` everywhere + the levels; off = `re` everywhere (+ the
 * modes released); levels = `in=` only (a running playback follows, an
 * off one stays off); mode = the chosen mode `go`, its siblings `re`.
 */
export function rigOps(f: RigFixture, s: RigFixtureState, action: "on" | "off" | "levels" | "mode"): RigOp[] {
  switch (action) {
    case "on":
      return [...rigChannels(f).map((key): RigOp => ({ key, cmd: "go" })), ...rigLevelOps(f, s)];
    case "off":
      return [
        ...rigChannels(f).map((key): RigOp => ({ key, cmd: "re" })),
        ...(f.kind === "combined" ? f.modes.map((m): RigOp => ({ key: m.key, cmd: "re" })) : []),
      ];
    case "levels":
      return rigLevelOps(f, s);
    case "mode":
      return f.kind === "combined" ? f.modes.map((m): RigOp => ({ key: m.key, cmd: s.mode === m.key ? "go" : "re" })) : [];
  }
}

/** Console → hub: one fixture action (the hub keeps the state, builds the URLs). */
export interface HostRigAction {
  fixture: string;
  action: "on" | "off" | "levels" | "mode";
  state: RigFixtureState;
}

/** Hub → consoles: every fixture's state + the last LPU-2 outcome per fixture. */
export interface HostRigState {
  fixtures: Record<string, RigFixtureState>;
  results: Record<string, { ok: boolean; error?: string; at: number; urls: string[] }>;
}

export type { HostLightGlobal };
