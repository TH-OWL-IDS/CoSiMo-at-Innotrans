import { Preferences } from "@capacitor/preferences";

/**
 * The physical seat position (1-4) this iPad is mounted at — set once per
 * device in the hidden operator screen, like the panel calibration. The hub
 * uses it to pick the seat's reading-lamp playback (PB 49-52); without it
 * the lamp stays simulated. 0 = not configured.
 */
const KEY = "cosimo.seatNumber";

export async function getSeatNumber(): Promise<number> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 0;
  } catch {
    return 0;
  }
}

export async function setSeatNumber(seat: number): Promise<void> {
  await Preferences.set({ key: KEY, value: String(seat) });
}
