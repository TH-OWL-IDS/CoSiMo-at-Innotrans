/**
 * Parameterised face poses, ported from the CoSiMo-mockup. Every expression is
 * described by the same set of numbers so any two poses can be interpolated —
 * no SVG path-command mismatches between, say, a smile stroke and an open "O".
 *
 * The emotion vocabulary is the shared one (@cosimo/shared) so the realtime
 * service and this Face engine cannot drift apart.
 */

import type { FaceEmotion } from "@cosimo/shared";

export interface FaceParams {
  /** Eye openness per eye, 0 (closed lid stroke) → 1 (full scribble nest). */
  eyeOpenL: number;
  eyeOpenR: number;
  /** Shape of the closed lid: + arches up (happy ^^), − relaxes down (sleepy). */
  lidCurve: number;
  /** Eye roundness, 0 (narrow stroke) → 1 (wide "O" ring). */
  eyeRound: number;
  /** Gaze offset, -1…1 on each axis; shifts both eyes together. */
  gazeX: number;
  gazeY: number;
  /** Brow lift in px — raises the whole eye scribble. */
  browLiftL: number;
  browLiftR: number;
  /** Brow slant in degrees — positive turns the inner end up (worry). */
  browSlantL: number;
  browSlantR: number;
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

export const FACE_STATES: Record<FaceEmotion, FaceParams> = {
  neutral: {
    eyeOpenL: 1, eyeOpenR: 1, lidCurve: 0, eyeRound: 0.12, gazeX: 0, gazeY: 0,
    browLiftL: 0, browLiftR: 0, browSlantL: 0, browSlantR: 0,
    mouthWidth: 44, mouthY: 158, mouthCurve: 45, mouthOpen: 0, tilt: 0,
  },
  happy: {
    eyeOpenL: 0.12, eyeOpenR: 0.12, lidCurve: 0.9, eyeRound: 0.1, gazeX: 0, gazeY: 0,
    browLiftL: 6, browLiftR: 6, browSlantL: 2, browSlantR: 2,
    mouthWidth: 50, mouthY: 154, mouthCurve: 55, mouthOpen: 0.45, tilt: 0,
  },
  thinking: {
    eyeOpenL: 0.85, eyeOpenR: 0.55, lidCurve: 0, eyeRound: 0.15, gazeX: -0.7, gazeY: -0.6,
    browLiftL: 12, browLiftR: -2, browSlantL: 10, browSlantR: 2,
    mouthWidth: 18, mouthY: 164, mouthCurve: 8, mouthOpen: 0, tilt: -2,
  },
  listening: {
    eyeOpenL: 1, eyeOpenR: 1, lidCurve: 0, eyeRound: 0.35, gazeX: 0.2, gazeY: 0,
    browLiftL: 8, browLiftR: 8, browSlantL: 0, browSlantR: 0,
    mouthWidth: 24, mouthY: 160, mouthCurve: 14, mouthOpen: 0.12, tilt: 2,
  },
  speaking: {
    eyeOpenL: 0.9, eyeOpenR: 0.9, lidCurve: 0, eyeRound: 0.2, gazeX: 0, gazeY: 0,
    browLiftL: 3, browLiftR: 3, browSlantL: 0, browSlantR: 0,
    mouthWidth: 26, mouthY: 166, mouthCurve: -8, mouthOpen: 0.8, tilt: 0,
  },
  sleeping: {
    eyeOpenL: 0, eyeOpenR: 0, lidCurve: -0.55, eyeRound: 0, gazeX: 0, gazeY: 0,
    browLiftL: -6, browLiftR: -6, browSlantL: -2, browSlantR: -2,
    mouthWidth: 24, mouthY: 164, mouthCurve: 12, mouthOpen: 0, tilt: 1.5,
  },
  sad: {
    eyeOpenL: 0.65, eyeOpenR: 0.65, lidCurve: -0.15, eyeRound: 0.1, gazeX: 0, gazeY: 0.4,
    browLiftL: 5, browLiftR: 5, browSlantL: 14, browSlantR: 14,
    mouthWidth: 36, mouthY: 166, mouthCurve: -26, mouthOpen: 0, tilt: -1.5,
  },
  surprised: {
    eyeOpenL: 1, eyeOpenR: 1, lidCurve: 0, eyeRound: 1, gazeX: 0, gazeY: -0.2,
    browLiftL: 16, browLiftR: 16, browSlantL: 0, browSlantR: 0,
    mouthWidth: 18, mouthY: 172, mouthCurve: -18, mouthOpen: 1, tilt: 0,
  },
};
