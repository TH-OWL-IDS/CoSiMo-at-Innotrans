import { Preferences } from "@capacitor/preferences";

/**
 * Auto-checkout: after 2 min of silence the hub checks this seat out again
 * (back to the check-in in the circle, session over). Operator setting, per
 * device — off for an iPad that is carried around, where re-checking-in
 * every few minutes would be a nuisance. Default on.
 */
const KEY = "cosimo.autoCheckout";

export async function getAutoCheckout(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value !== "0";
  } catch {
    return true;
  }
}

export async function setAutoCheckout(on: boolean): Promise<void> {
  await Preferences.set({ key: KEY, value: on ? "1" : "0" });
}
