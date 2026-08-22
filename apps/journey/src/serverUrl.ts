/**
 * Where the realtime service lives. Priority: `?server=` in the URL (kept in
 * localStorage, so it survives reloads; `?server=` clears it) → the
 * build-time VITE_REALTIME_URL → same-origin (the Vite dev proxy). Mirrors
 * the kiosk's own resolution order.
 */
export function resolveServerUrl(): string {
  const KEY = "cosimo.journey.serverUrl";
  const q = new URLSearchParams(window.location.search).get("server");
  if (q != null) {
    const url = q.trim().replace(/\/+$/, "");
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
    return url;
  }
  return localStorage.getItem(KEY) ?? (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? "";
}
