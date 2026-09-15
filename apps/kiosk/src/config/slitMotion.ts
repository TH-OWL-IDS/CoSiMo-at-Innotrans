import { Preferences } from "@capacitor/preferences";
import { DEFAULT_SLIT_MOTION, type SlitMotion } from "@cosimo/seat-ui";

/** Per-device timing of the slit's rest rotation — set in the hidden operator screen. */
const KEY = "cosimo.slitMotion";

export { DEFAULT_SLIT_MOTION, type SlitMotion };

export async function getSlitMotion(): Promise<SlitMotion> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return DEFAULT_SLIT_MOTION;
    const p = JSON.parse(value) as Partial<SlitMotion>;
    return {
      stepSec: Number.isFinite(p.stepSec) && p.stepSec! >= 1 ? p.stepSec! : DEFAULT_SLIT_MOTION.stepSec,
      slideMs: Number.isFinite(p.slideMs) && p.slideMs! >= 0 ? p.slideMs! : DEFAULT_SLIT_MOTION.slideMs,
    };
  } catch {
    return DEFAULT_SLIT_MOTION;
  }
}

export async function setSlitMotion(m: SlitMotion): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(m) });
}
