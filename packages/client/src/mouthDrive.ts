/**
 * The mouth drive's arithmetic, pure: from one analyser sample (the RMS of
 * the time-domain buffer and the summed low / high band magnitudes) to
 * `open` (0–1, loudness envelope) and `tilt` (0–1, brightness).
 *
 * Both self-calibrate per clip. Fixed thresholds made a female voice move
 * less than a male one (2026-09-19): at the same loudness it carries less
 * low-band energy, so an absolute RMS gain under-opened the mouth, and it
 * sits higher in the spectrum, so a fixed 1 kHz split kept the brightness
 * pinned high with no room to vary. Now the loudness is measured against
 * the clip's own running peak (auto-gain) and the brightness against the
 * clip's own running mean — what varies is the vowel, not the voice.
 */

/** Quietest running peak the auto-gain calibrates against (RMS, 0–1):
 *  below it a clip is treated as near-silent instead of amplified noise. */
export const PEAK_FLOOR = 0.06;

export interface MouthDriveState {
  level: number;
  peak: number;
  tiltMean: number | null;
}

export function newMouthDriveState(): MouthDriveState {
  return { level: 0, peak: PEAK_FLOOR, tiltMean: null };
}

/** One sample step; mutates `s`, returns the drive. */
export function mouthDriveStep(s: MouthDriveState, rms: number, low: number, high: number): { open: number; tilt: number } {
  // auto-gain: the clip's own peak (slow decay, ~2 s half-life at 60 Hz) is
  // "wide open"; a quiet voice therefore uses the whole range like a loud one
  s.peak = Math.max(PEAK_FLOOR, rms, s.peak * 0.994);
  const norm = rms / s.peak;
  const target = Math.min(1, Math.pow(Math.max(0, norm - 0.12) / 0.88, 0.8));
  // fast attack / slower release: the mouth snaps open and eases shut
  s.level += (target - s.level) * (target > s.level ? 0.55 : 0.18);

  // relative brightness: the deviation from this clip's running mean,
  // tracked only while there is voice so pauses don't drag it
  const ratio = low + high > 0 ? high / (low + high) : 0.5;
  if (s.level > 0.1) s.tiltMean = s.tiltMean == null ? ratio : s.tiltMean + (ratio - s.tiltMean) * 0.03;
  const mean = s.tiltMean ?? ratio;
  const tilt = Math.max(0, Math.min(1, 0.5 + (ratio - mean) * 3));
  return { open: s.level, tilt };
}
