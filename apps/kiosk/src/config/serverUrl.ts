import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/**
 * Where the CoSiMo *realtime* service (the WebSocket) lives. The kiosk is
 * socket-only — it never calls the CMS directly (persona, telemetry and the
 * face all arrive over the socket), so this is the realtime endpoint, not the
 * CMS. In production the CMS and realtime are separate Cloudflare hostnames
 * (cosimo.… → CMS, ws-cosimo.… → realtime); the kiosk wants the ws- one.
 *
 * - Web/dev build: defaults to same-origin ("") — the Vite proxy forwards
 *   /socket.io to the local realtime service.
 * - Native build: baked default below; overridable on-device via the hidden
 *   setup screen (3s hold on the slit), persisted with Capacitor Preferences.
 */

/** Baked-in production realtime endpoint — fresh installs auto-connect here. */
export const DEFAULT_SERVER_URL = "https://ws-cosimo.homannjohannes.de";

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
