import { useRef } from "react";

/**
 * The voice as the abstract entities feel it: the same `mouthDrive` the
 * face uses (loudness envelope `open`, brightness `tilt`, from the audio
 * that is actually playing), sampled once per rendered frame and smoothed
 * (fast attack, slower release) so a form swells with the voice instead of
 * jittering. Only while speaking; otherwise it eases back to rest.
 */
export type MouthDrive = () => { open: number; tilt: number } | null;

export function useVoice(mouthDrive: MouthDrive | undefined, speaking: boolean): { open: number; tilt: number } {
  const v = useRef({ open: 0, tilt: 0 });
  const d = speaking && mouthDrive ? mouthDrive() : null;
  const targetOpen = d ? Math.max(0, Math.min(1, d.open)) : 0;
  const targetTilt = d ? Math.max(0, Math.min(1, d.tilt)) : 0;
  const cur = v.current;
  cur.open += (targetOpen - cur.open) * (targetOpen > cur.open ? 0.45 : 0.12);
  cur.tilt += (targetTilt - cur.tilt) * 0.2;
  return { open: cur.open, tilt: cur.tilt };
}
