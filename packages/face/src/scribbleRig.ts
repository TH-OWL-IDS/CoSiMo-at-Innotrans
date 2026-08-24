import { FACE_STATES, type FaceParams } from "./states.js";
import type { FaceEmotion } from "@cosimo/shared";

/**
 * The scribble face's RIG: every pure function that turns FaceParams (+ the
 * ambient idle layer) into concrete SVG attribute values, with no React and
 * no DOM. The animated component owns refs to the static SVG structure and
 * writes a `ScribbleFrame` into it each tick (GSAP ticker) — React never
 * re-renders for animation.
 *
 * This module is also the reference "face pack": a future face is a new
 * artwork (SVG structure) plus its own `computeFrame` against the SAME
 * FaceParams axes — poses, idle life and the audio-driven mouth carry over.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampS = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* Layout constants, traced from the artwork (mapped onto the 260×200 canvas). */
export const EYE_L = { x: 48, y: 31 };
export const EYE_R = { x: 202, y: 33 };
export const MOUTH_CX = 104;
export const FACE_C = { x: 130, y: 110 };

/** Deterministic pseudo-random in [0,1) from a step index — drives varied
 *  saccade targets and blink jitter without stateful randomness. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 0.7) * 43758.5453;
  return s - Math.floor(s);
};
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** One eye's blink squash (1 open … 0 shut) at time t, with jittered timing
 *  and the odd double-blink. `phase` staggers the two eyes a hair. */
function blinkFactor(t: number, phase: number) {
  const period = 4.0;
  const tt = t + phase;
  const n = Math.floor(tt / period);
  const start = n * period + hash(n * 1.7) * 2.2; // 0–2.2s jitter
  const dur = 0.16;
  const dt = tt - start;
  if (dt >= 0 && dt <= dur) return 1 - Math.sin((dt / dur) * Math.PI);
  // occasional second flick
  if (hash(n * 2.3) > 0.85) {
    const dt2 = dt - (dur + 0.09);
    if (dt2 >= 0 && dt2 <= dur) return 1 - Math.sin((dt2 / dur) * Math.PI);
  }
  return 1;
}

export interface Idle {
  p: FaceParams;
  blinkL: number;
  blinkR: number;
  bobY: number;
  sway: number;
  breathe: number;
  /** Head turn, -1 (left) … 1 (right) — CoSiMo looking around. */
  yaw: number;
}

/** The rig at perfect rest — used with idle off and under test. */
export function restIdle(p: FaceParams): Idle {
  return { p, blinkL: 1, blinkR: 1, bobY: 0, sway: 0, breathe: 1, yaw: 0 };
}

/**
 * Layer idle life onto the (already emotion-tweened) pose: breathing, a slow
 * head sway/bob, wandering gaze punctuated by quick saccades, independent brow
 * micro-lifts and a faint mouth breath. Everything rests at 0 when t=0, so a
 * disabled clock sits exactly on the pose.
 */
export function faceAmbient(
  base: FaceParams,
  t: number,
  target: FaceParams,
  emotion: string,
): Idle {
  const p = { ...base };

  // gaze — slow drift plus saccades that flick to a new spot and hold
  const driftX = 0.1 * Math.sin(t * 0.31) + 0.06 * Math.sin(t * 0.73 + 1.3);
  const driftY = 0.06 * Math.sin(t * 0.27 + 0.5) + 0.04 * Math.sin(t * 0.61);
  const seg = 2.6;
  const n = Math.floor(t / seg);
  const f = t / seg - n;
  const fromX = (hash(n) * 2 - 1) * 0.6;
  const toX = (hash(n + 1) * 2 - 1) * 0.6;
  const fromY = (hash(n + 99) * 2 - 1) * 0.32;
  const toY = (hash(n + 100) * 2 - 1) * 0.32;
  const k = smoothstep(0, 0.14, f);
  p.gazeX = clampS(p.gazeX + driftX + fromX + (toX - fromX) * k, -1, 1);
  p.gazeY = clampS(p.gazeY + driftY + fromY + (toY - fromY) * k, -1, 1);

  // brows — small independent motion, with a shared "interest" lift right
  // after a saccade so the eyes and brows feel connected
  const interest = smoothstep(0, 0.12, f) * (1 - smoothstep(0.12, 0.5, f)) * 3;
  p.browLiftL += 0.8 * Math.sin(t * 0.6) + interest;
  p.browLiftR += 0.8 * Math.sin(t * 0.55 + 2.0) + interest;

  // mouth
  if (emotion === "speaking") {
    // speech cadence: fast syllable opens, a slower word-level swell, and
    // periodic pauses where the mouth settles to its friendly smile
    const syllable = 0.5 - 0.5 * Math.cos(t * 9);
    const swell = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.5 + 1));
    const gate = smoothstep(0.25, 0.55, 0.5 + 0.5 * Math.sin(t * 0.7));
    p.mouthOpen = clampS(0.05 + 0.5 * syllable * swell * gate, 0.04, 0.6);
    p.mouthWidth *= 1 + 0.08 * (p.mouthOpen - 0.4);
    // small emphasis in the brows while talking
    const nod = 0.6 * Math.sin(t * 2.1);
    p.browLiftL += nod;
    p.browLiftR += nod;
  } else if (target.mouthOpen < 0.3) {
    // a faint breath in width/curve at rest
    p.mouthWidth *= 1 + 0.015 * Math.sin(t * 0.9);
    p.mouthCurve += 1.2 * Math.sin(t * 0.5 + 0.4);
  }

  // head turn — CoSiMo slowly looks around: hold a facing for a few seconds,
  // then ease to a new random yaw. The eyes lead the turn a little.
  const hseg = 3.4;
  const hn = Math.floor(t / hseg);
  const hf = t / hseg - hn;
  const yawFrom = hash(hn + 31) * 2 - 1;
  const yawTo = hash(hn + 32) * 2 - 1;
  const yaw = (yawFrom + (yawTo - yawFrom) * smoothstep(0.12, 0.62, hf)) * 0.85;
  p.gazeX = clampS(p.gazeX + yaw * 0.22, -1, 1);

  // blink only where the pose has open eyes; a drawn lid must not squash
  const canBlink = target.eyeOpenL > 0.5 && target.eyeOpenR > 0.5;
  const blinkL = canBlink ? blinkFactor(t, 0) : 1;
  const blinkR = canBlink ? blinkFactor(t, 0.02) : 1;

  return {
    p,
    blinkL,
    blinkR,
    bobY: 1.6 * Math.sin(t * 0.9),
    sway: 0.5 * Math.sin(t * 0.47),
    breathe: 1 + 0.01 * Math.sin(t * 1.25),
    yaw,
  };
}

/**
 * Mouth: one asymmetric sweep — starts high left, dips low, trails off to the
 * right (the artwork's lazy smile). A reverse curve opens it into an oval;
 * at mouthOpen 0 the return leg retraces the sweep exactly, so a closed
 * mouth stays a single stroke.
 */
export function mouthPath(p: FaceParams): string {
  const w = p.mouthWidth * 1.3;
  const c = p.mouthCurve;
  const lx = MOUTH_CX - w;
  const rx = MOUTH_CX + w;
  // The artwork's lazy left-high/right-low tilt; levels out as the mouth
  // opens so open shapes (speaking, surprised "O") stay round.
  const tf = 1 - p.mouthOpen;
  const ly = p.mouthY - 0.45 * c * tf;
  const ry = p.mouthY + 0.35 * c * tf;
  const c1x = MOUTH_CX - 0.9 * p.mouthWidth;
  const c2x = MOUTH_CX + 0.5 * p.mouthWidth;
  const c1y = p.mouthY + 0.85 * c;
  const c2y = p.mouthY + 0.6 * c;
  const o = p.mouthOpen * 55;
  return (
    `M${lx} ${ly} C${c1x} ${c1y}, ${c2x} ${c2y}, ${rx} ${ry}` +
    ` C${c2x} ${c2y + o}, ${c1x} ${c1y + o}, ${lx} ${ly}`
  );
}

/* Nose, derived from the artwork but softened: a short stroke falling from
   between the eyes, rounding gently at the tip into a small leftward base.
   Static across expressions. */
export const NOSE_D =
  "M143 72" +
  " C146.5 86, 152.5 101, 155.5 114" +
  " C157 121, 156.5 126.5, 153.5 129" +
  " C149.5 131.5, 139 130.8, 129.5 129.5";

/** Per-node attribute values for one animation frame. The component writes
 *  these into the static SVG structure (setAttribute) — no re-render. */
export interface ScribbleFrame {
  root: { transform: string };
  browL: { d: string; transform: string };
  browR: { d: string; transform: string };
  eyeL: { transform: string };
  eyeR: { transform: string };
  nestL: { transform: string; opacity: number };
  nestR: { transform: string; opacity: number };
  pupilL: { transform: string };
  pupilR: { transform: string };
  lidL: { d: string; opacity: number };
  lidR: { d: string; opacity: number };
  nose: { transform: string };
  mouth: { d: string };
}

function eyeFrame(p: FaceParams, side: "L" | "R", blink: number) {
  const { x, y } = side === "L" ? EYE_L : EYE_R;
  const open = side === "L" ? p.eyeOpenL : p.eyeOpenR;
  const lift = side === "L" ? p.browLiftL : p.browLiftR;
  const slant = side === "L" ? p.browSlantL : p.browSlantR;
  const rot = (side === "L" ? -slant : slant) * 0.8;

  const sx = 1 + p.eyeRound * 0.3;
  const sy = sx * Math.max(0.5, open);
  const nestVis = clamp01((open - 0.2) / 0.25);

  const lidY = y + 3;
  const lidD = `M${x - 15} ${lidY} Q${x} ${lidY - p.lidCurve * 20} ${x + 15} ${lidY}`;

  return {
    eye: {
      transform:
        `translate(0 ${-lift * 0.6}) rotate(${rot} ${x} ${y})` +
        ` translate(${x} ${y}) scale(1 ${blink}) translate(${-x} ${-y})`,
    },
    nest: {
      transform: `translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})`,
      opacity: nestVis,
    },
    pupil: { transform: `translate(${p.gazeX * 5} ${p.gazeY * 4})` },
    lid: { d: lidD, opacity: 1 - nestVis },
  };
}

function browFrame(p: FaceParams, side: "L" | "R") {
  const { x, y } = side === "L" ? EYE_L : EYE_R;
  const lift = side === "L" ? p.browLiftL : p.browLiftR;
  const slant = side === "L" ? p.browSlantL : p.browSlantR;
  const curve = side === "L" ? p.browCurveL : p.browCurveR;

  const by = y - 30 - lift * 0.5;
  const hw = 17;
  const d = `M${x - hw} ${by} Q${x} ${by - curve} ${x + hw} ${by}`;
  // inner (nose-side) end rises for worry: left eye's inner end is on the
  // right, right eye's on the left — hence the opposite rotation signs.
  const rot = (side === "L" ? -1 : 1) * slant * 0.8;
  return { d, transform: `rotate(${rot} ${x} ${by})` };
}

/** Compute every node's attributes for the pose+idle of this frame. */
export function computeScribbleFrame(p: FaceParams, rig: Idle): ScribbleFrame {
  const { x: cx, y: cy } = FACE_C;
  // Fake the head turn in 2.5D: slide the features toward the turn, compress
  // horizontally as it turns away, and let the head roll into it a touch.
  const turnShift = rig.yaw * 10;
  const turnScaleX = 1 - 0.16 * Math.abs(rig.yaw);
  const roll = rig.yaw * 1.6;
  const root =
    `translate(${turnShift} ${rig.bobY})` +
    ` rotate(${p.tilt + rig.sway + roll} ${cx} ${cy})` +
    ` translate(${cx} ${cy}) scale(${turnScaleX * rig.breathe} ${rig.breathe}) translate(${-cx} ${-cy})`;

  const eyeL = eyeFrame(p, "L", rig.blinkL);
  const eyeR = eyeFrame(p, "R", rig.blinkR);

  // The nose hooks to one side, so it flips to follow the head turn — an
  // instant mirror about the centreline the moment the yaw crosses over (no
  // fade), so it's always a single nose on the near side.
  const noseTf = rig.yaw > 0 ? "translate(260 0) scale(-1 1)" : "";

  return {
    root: { transform: root },
    browL: browFrame(p, "L"),
    browR: browFrame(p, "R"),
    eyeL: eyeL.eye,
    eyeR: eyeR.eye,
    nestL: eyeL.nest,
    nestR: eyeR.nest,
    pupilL: eyeL.pupil,
    pupilR: eyeR.pupil,
    lidL: eyeL.lid,
    lidR: eyeR.lid,
    nose: { transform: noseTf },
    mouth: { d: mouthPath(p) },
  };
}

/**
 * A face pack: the same FaceParams axes + poses, a different body. The
 * animated component hosts a pack's frame computer; a future face brings its
 * own SVG structure and `computeFrame` while inheriting poses and idle life.
 */
export interface FacePack {
  id: string;
  poses: Record<FaceEmotion, FaceParams>;
  computeFrame: (p: FaceParams, rig: Idle) => ScribbleFrame;
}

export const scribblePack: FacePack = {
  id: "scribble",
  poses: FACE_STATES,
  computeFrame: computeScribbleFrame,
};
