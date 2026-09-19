import { Preferences } from "@capacitor/preferences";

/**
 * "Getragenes iPad": this iPad is carried by staff — it is not in the cabin
 * LAN and not a seat. The hub then never makes it the light actuator (it
 * would time out while the seat iPad next to it could switch) and never
 * checks it out after silence. Operator setting, per device. Default off.
 */
const KEY = "cosimo.carried";

export async function getCarried(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value === "1";
  } catch {
    return false;
  }
}

export async function setCarried(on: boolean): Promise<void> {
  await Preferences.set({ key: KEY, value: on ? "1" : "0" });
}
