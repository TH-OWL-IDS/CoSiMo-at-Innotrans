import { Preferences } from "@capacitor/preferences";

/**
 * Showcase ("Schaustellung"): this iPad performs silently and endlessly —
 * for the two seats visitors cannot reach. Operator setting, per device,
 * next to the seat number; the talk button is ignored while it is on and
 * only the hidden menu turns it off.
 */
const KEY = "cosimo.showcase";

export async function getShowcase(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value === "1";
  } catch {
    return false;
  }
}

export async function setShowcase(on: boolean): Promise<void> {
  await Preferences.set({ key: KEY, value: on ? "1" : "0" });
}
