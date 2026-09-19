/**
 * The hand-drawn wobble, baked into geometry.
 *
 * The scribble look used to come from an SVG `feTurbulence` +
 * `feDisplacementMap` filter over the whole drawing. WebKit rasterises such
 * a filter on the CPU, and every frame the face moves the whole filtered
 * group is redone — on the iPad mini that is ~2 Mpx of noise per frame and
 * the visible stutter (2026-09-19). Here the same idea is applied to the
 * PATH POINTS instead: every stroke is resampled into short segments and
 * each point is shifted by a smooth 2-D noise field (same frequency and
 * amplitude the filter had). Costs a few hundred additions per frame, no
 * raster work at all. The wobble is fixed to the stroke (it moves with the
 * eye instead of "swimming" under it) — calmer, and nobody missed the swim.
 */

const FREQ = 0.014;
const AMP = 3.2;

/** Deterministic hash → [0, 1). */
function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise with quintic interpolation → [0, 1). */
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Two octaves, like the filter's `numOctaves=2` → [-1, 1]. */
function fbm(x: number, y: number, seed: number): number {
  return (noise(x, y, seed) * 2 - 1) * 0.7 + (noise(x * 2 + 11, y * 2 + 7, seed + 3) * 2 - 1) * 0.3;
}

/** The displacement at a point. */
function shift(x: number, y: number, seed: number): [number, number] {
  return [fbm(x * FREQ, y * FREQ, seed) * AMP, fbm(x * FREQ + 37, y * FREQ + 91, seed + 101) * AMP];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

type Pt = [number, number];

/**
 * Wobble an absolute path (M / L / C / Q / Z — what this package emits).
 * Each segment is resampled every ~5 units, so the polyline reads as a
 * smooth stroke under round joins; `seed` keeps strokes from sharing a
 * wobble.
 */
export function wobblePath(d: string, seed = 0): string {
  const tokens = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!tokens) return d;
  let out = "";
  let cmd = "";
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let i = 0;
  const num = () => Number(tokens[i++]);
  const emit = (p: Pt, move: boolean) => {
    const [dx, dy] = shift(p[0], p[1], seed);
    out += `${move ? "M" : "L"}${r1(p[0] + dx)} ${r1(p[1] + dy)}`;
  };
  const sample = (f: (t: number) => Pt, len: number) => {
    const n = Math.min(48, Math.max(3, Math.round(len / 5)));
    for (let k = 1; k <= n; k++) emit(f(k / n), false);
  };
  const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[MLCQZ]/i.test(t)) { cmd = t.toUpperCase(); i++; if (cmd === "Z") { out += "Z"; cur = start; continue; } }
    if (cmd === "M") {
      cur = [num(), num()];
      start = cur;
      emit(cur, true);
      cmd = "L"; // subsequent pairs are implicit line-tos
    } else if (cmd === "L") {
      const p: Pt = [num(), num()];
      const a = cur;
      sample((u) => [a[0] + (p[0] - a[0]) * u, a[1] + (p[1] - a[1]) * u], dist(a, p));
      cur = p;
    } else if (cmd === "C") {
      const c1: Pt = [num(), num()];
      const c2: Pt = [num(), num()];
      const p: Pt = [num(), num()];
      const a = cur;
      sample((u) => {
        const v = 1 - u;
        return [
          v * v * v * a[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p[0],
          v * v * v * a[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p[1],
        ];
      }, dist(a, c1) + dist(c1, c2) + dist(c2, p));
      cur = p;
    } else if (cmd === "Q") {
      const c: Pt = [num(), num()];
      const p: Pt = [num(), num()];
      const a = cur;
      sample((u) => {
        const v = 1 - u;
        return [v * v * a[0] + 2 * v * u * c[0] + u * u * p[0], v * v * a[1] + 2 * v * u * c[1] + u * u * p[1]];
      }, dist(a, c) + dist(c, p));
      cur = p;
    } else {
      i++; // stray number — skip
    }
  }
  return out;
}

/** A wobbled ellipse outline (closed path), optionally rotated about its centre. */
export function wobbleEllipse(cx: number, cy: number, rx: number, ry: number, seed = 0, rotateDeg = 0): string {
  const n = Math.min(64, Math.max(16, Math.round((rx + ry) * 0.9)));
  const rot = (rotateDeg * Math.PI) / 180;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  let out = "";
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    const x = cx + ex * cr - ey * sr;
    const y = cy + ex * sr + ey * cr;
    const [dx, dy] = shift(x, y, seed);
    out += `${k === 0 ? "M" : "L"}${r1(x + dx)} ${r1(y + dy)}`;
  }
  return out + "Z";
}
