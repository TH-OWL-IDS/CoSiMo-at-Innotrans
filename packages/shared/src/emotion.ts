/**
 * CoSiMo's emotional vocabulary — the single source of truth shared by the
 * realtime service (which decides the emotion) and the PWA Face engine (which
 * renders it). Mirrors the FaceEmotion set ported from the CoSiMo-mockup.
 */

export type FaceEmotion =
  | "neutral"
  | "happy"
  | "thinking"
  | "listening"
  | "speaking"
  | "sleeping"
  | "sad"
  | "surprised";

export const FACE_EMOTIONS: readonly FaceEmotion[] = [
  "neutral",
  "happy",
  "thinking",
  "listening",
  "speaking",
  "sleeping",
  "sad",
  "surprised",
] as const;

/**
 * Mechanical emotions are driven by the conversation pipeline (state of the
 * turn), not chosen by the model. The PWA/realtime owns these transitions.
 */
export const MECHANICAL_EMOTIONS = [
  "sleeping",
  "neutral",
  "listening",
  "thinking",
  "speaking",
] as const satisfies readonly FaceEmotion[];

/**
 * Expressive emotions are chosen by Claude as part of its structured turn
 * output, to colour the reply. Personas may bias which of these CoSiMo leans to.
 */
export const EXPRESSIVE_EMOTIONS = [
  "neutral",
  "happy",
  "sad",
  "surprised",
] as const satisfies readonly FaceEmotion[];

export type MechanicalEmotion = (typeof MECHANICAL_EMOTIONS)[number];
export type ExpressiveEmotion = (typeof EXPRESSIVE_EMOTIONS)[number];

export function isFaceEmotion(value: unknown): value is FaceEmotion {
  return typeof value === "string" && (FACE_EMOTIONS as readonly string[]).includes(value);
}
