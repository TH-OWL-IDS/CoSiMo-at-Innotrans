import type { FaceEmotion } from "@cosimo/shared";

/**
 * Parameterised face poses (ported from CoSiMo-mockup). Every expression is
 * described by the same set of numbers so any two poses can be interpolated —
 * no SVG path-command mismatches between, say, a smile stroke and an open "O"
 * mouth.
 *
 * Geometry lives in CosimoFaceAnimated; this table is the single source of
 * truth for what each expression looks like. The FaceEmotion vocabulary
 * itself lives in @cosimo/shared, shared with the realtime service.
 */

export interface FaceParams {
  /** Eye openness per eye, 0 (closed lid stroke) → 1 (full scribble nest).
   *  Below ~0.45 the nest cross-fades into a drawn lid. */
  eyeOpenL: number;
  eyeOpenR: number;
  /** Shape of the closed lid: + arches up (happy ^^), − relaxes down (sleepy). */
  lidCurve: number;
  /** Eye roundness, 0 (narrow stroke) → 1 (wide "O" ring). */
  eyeRound: number;
  /** Gaze offset, -1…1 on each axis; shifts both eyes together. */
  gazeX: number;
  gazeY: number;
  /** Brow lift in px — raises the whole eye scribble (its top loops act as
   *  the eyebrow in the artwork). */
  browLiftL: number;
  browLiftR: number;
  /** Brow slant in degrees — tilts the eye scribble; positive turns the
   *  inner (nose-side) end up, the worry direction. */
  browSlantL: number;
  browSlantR: number;
  /** Separate eyebrow-stroke arch: + arches up (raised/surprised), − flattens
   *  or furrows (frown/sleep). Drawn above each eye as its own stroke. */
  browCurveL: number;
  browCurveR: number;
  /** Mouth half-width in px. */
  mouthWidth: number;
  /** Mouth baseline y. */
  mouthY: number;
  /** Control-point offset below the baseline: + = smile, − = frown. */
  mouthCurve: number;
  /** 0 = single stroke, 1 = fully open oval. */
  mouthOpen: number;
  /** Whole-face tilt in degrees. */
  tilt: number;
}

/* The neutral pose matches the original scribble artwork: relaxed loops,
   pupils centred, the lazy asymmetric smile. */
export const FACE_STATES: Record<FaceEmotion, FaceParams> = {
  neutral: {
    eyeOpenL: 1, eyeOpenR: 1, lidCurve: 0, eyeRound: 0.12, gazeX: 0, gazeY: 0,
    browLiftL: 0, browLiftR: 0, browSlantL: 0, browSlantR: 0,
    browCurveL: 3, browCurveR: 3,
    mouthWidth: 44, mouthY: 158, mouthCurve: 45, mouthOpen: 0, tilt: 0,
  },
  happy: {
    eyeOpenL: 0.12, eyeOpenR: 0.12, lidCurve: 0.9, eyeRound: 0.1, gazeX: 0, gazeY: 0,
    browLiftL: 6, browLiftR: 6, browSlantL: 2, browSlantR: 2,
    browCurveL: 7, browCurveR: 7,
    mouthWidth: 50, mouthY: 154, mouthCurve: 55, mouthOpen: 0.45, tilt: 0,
  },
  thinking: {
    eyeOpenL: 0.85, eyeOpenR: 0.55, lidCurve: 0, eyeRound: 0.15, gazeX: -0.7, gazeY: -0.6,
    browLiftL: 12, browLiftR: -2, browSlantL: 10, browSlantR: 2,
    browCurveL: 9, browCurveR: -1,
    mouthWidth: 18, mouthY: 164, mouthCurve: 8, mouthOpen: 0, tilt: -2,
  },
  listening: {
    eyeOpenL: 1, eyeOpenR: 1, lidCurve: 0, eyeRound: 0.35, gazeX: 0.2, gazeY: 0,
    browLiftL: 8, browLiftR: 8, browSlantL: 0, browSlantR: 0,
    browCurveL: 6, browCurveR: 6,
    mouthWidth: 24, mouthY: 160, mouthCurve: 14, mouthOpen: 0.12, tilt: 2,
  },
  speaking: {
    eyeOpenL: 0.95, eyeOpenR: 0.95, lidCurve: 0, eyeRound: 0.18, gazeX: 0, gazeY: 0,
    browLiftL: 5, browLiftR: 5, browSlantL: 0, browSlantR: 0,
    browCurveL: 5, browCurveR: 5,
    mouthWidth: 30, mouthY: 160, mouthCurve: 20, mouthOpen: 0.5, tilt: 0,
  },
  sleeping: {
    eyeOpenL: 0, eyeOpenR: 0, lidCurve: -0.55, eyeRound: 0, gazeX: 0, gazeY: 0,
    browLiftL: -6, browLiftR: -6, browSlantL: -2, browSlantR: -2,
    browCurveL: -3, browCurveR: -3,
    mouthWidth: 24, mouthY: 164, mouthCurve: 12, mouthOpen: 0, tilt: 1.5,
  },
  sad: {
    eyeOpenL: 0.65, eyeOpenR: 0.65, lidCurve: -0.15, eyeRound: 0.1, gazeX: 0, gazeY: 0.4,
    browLiftL: 5, browLiftR: 5, browSlantL: 14, browSlantR: 14,
    browCurveL: 1, browCurveR: 1,
    mouthWidth: 36, mouthY: 166, mouthCurve: -26, mouthOpen: 0, tilt: -1.5,
  },
  surprised: {
    eyeOpenL: 1, eyeOpenR: 1, lidCurve: 0, eyeRound: 1, gazeX: 0, gazeY: -0.2,
    browLiftL: 16, browLiftR: 16, browSlantL: 0, browSlantR: 0,
    browCurveL: 11, browCurveR: 11,
    mouthWidth: 18, mouthY: 172, mouthCurve: -18, mouthOpen: 1, tilt: 0,
  },
};
