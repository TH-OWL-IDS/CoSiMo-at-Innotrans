import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/**
 * Where the CoSiMo server (realtime + CMS behind one domain) lives.
 *
 * - Web/dev build: defaults to same-origin ("") — the Vite proxy (dev) or
 *   Caddy (prod) forwards /socket.io and /api.
 * - Native build: the URL is baked here as the default and can be overridden
 *   on-device via the hidden setup screen (3s long-press, top-left corner),
 *   persisted with Capacitor Preferences. No Xcode rebuild to repoint an iPad.
 */

/** Baked-in production server — fresh installs auto-connect here. The hidden
 *  setup screen (3s long-press, bottom-left) can override per device. */
export const DEFAULT_SERVER_URL = "https://cosimo.homannjohannes.de";

const KEY = "cosimo.serverUrl";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Resolve the server URL: stored override → baked default → null (must ask).
 *  On the web the empty string means same-origin and is always valid. */
export async function getServerUrl(): Promise<string | null> {
  const { value } = await Preferences.get({ key: KEY });
  if (value != null && value !== "") return value;
  if (!isNative()) return "";
  return DEFAULT_SERVER_URL || null;
}

export async function setServerUrl(url: string): Promise<void> {
  await Preferences.set({ key: KEY, value: url.trim().replace(/\/+$/, "") });
}
