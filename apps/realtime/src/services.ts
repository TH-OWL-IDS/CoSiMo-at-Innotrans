/**
 * The deployables as the hub sees them, for the console's Services card:
 * CMS, the hub itself, and the three static sites (console, seat emulator,
 * journey). Public hostnames come from the prod env (COSIMO_*_DOMAIN);
 * internal probe URLs from SERVICE_URL_* (compose sets the service names,
 * dev falls back to localhost). Probed every 15 s; pushed on change.
 */

import { existsSync } from "node:fs";
import { hostname } from "node:os";
import type { ServiceInfo } from "@cosimo/shared";
import { config } from "./config.js";
import type { Hub } from "./hub.js";

const IN_DOCKER = existsSync("/.dockerenv");
const env = (k: string) => (process.env[k]?.trim() ? process.env[k]!.trim() : null);

/** Public host per service: explicit var, else derived from COSIMO_DOMAIN. */
function publicHost(id: ServiceInfo["id"]): string | null {
  const base = env("COSIMO_DOMAIN");
  const explicit: Record<ServiceInfo["id"], string | null> = {
    cms: env("COSIMO_CMS_DOMAIN"),
    realtime: env("COSIMO_WS_DOMAIN"),
    console: env("COSIMO_CONSOLE_DOMAIN"),
    emulator: env("COSIMO_SEAT_DOMAIN"),
    journey: env("COSIMO_JOURNEY_DOMAIN"),
  };
  const prefix: Record<ServiceInfo["id"], string> = { cms: "cms-", realtime: "ws-", console: "console-", emulator: "seat-", journey: "journey-" };
  return explicit[id] ?? (base ? `${prefix[id]}${base}` : null);
}

/** Where the hub probes each service. Dev defaults are the local ports. */
function internalUrl(id: ServiceInfo["id"]): string | null {
  switch (id) {
    case "cms": return config.payload.internalUrl;
    case "realtime": return `http://localhost:${config.port}`;
    case "console": return env("SERVICE_URL_CONSOLE") ?? (IN_DOCKER ? null : "http://localhost:6102");
    case "emulator": return env("SERVICE_URL_EMULATOR") ?? (IN_DOCKER ? null : "http://localhost:6103");
    case "journey": return env("SERVICE_URL_JOURNEY") ?? (IN_DOCKER ? null : "http://localhost:6104");
  }
}

const portOf = (url: string | null): number | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
};

const DEFS: { id: ServiceInfo["id"]; label: string; path: string }[] = [
  { id: "cms", label: "CMS", path: "/api/globals/operator-config" },
  { id: "realtime", label: "WS (Hub)", path: "/health" },
  { id: "console", label: "Konsole", path: "/" },
  { id: "emulator", label: "Seat (Emulator)", path: "/" },
  { id: "journey", label: "Fahrt", path: "/" },
];

async function probe(url: string): Promise<number | null> {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(2500) });
    return res.ok ? Date.now() - started : null;
  } catch {
    return null;
  }
}

export class ServicesMonitor {
  private services: ServiceInfo[] = DEFS.map((d) => ({
    id: d.id,
    label: d.label,
    status: "unknown",
    publicHost: publicHost(d.id),
    internalUrl: internalUrl(d.id),
    port: portOf(internalUrl(d.id)),
    container: IN_DOCKER ? (d.id === "realtime" ? `realtime · ${hostname()}` : d.id) : null,
    latencyMs: null,
    checkedAt: null,
    docker: IN_DOCKER,
    restartable: Boolean(config.dockerProxyUrl) && IN_DOCKER,
  }));

  constructor(private readonly hub: Hub) {
    hub.setServicesLister(() => this.services);
  }

  /** One round: probe everything with a URL, then push if anything changed. */
  async tick(): Promise<void> {
    const before = JSON.stringify(this.services);
    await Promise.all(
      this.services.map(async (s, i) => {
        if (!s.internalUrl) return;
        const url = s.internalUrl.replace(/\/+$/, "") + DEFS[i]!.path;
        const latency = await probe(url);
        this.services[i] = { ...s, status: latency == null ? "down" : "ok", latencyMs: latency, checkedAt: new Date().toISOString() };
      }),
    );
    if (JSON.stringify(this.services) !== before) this.hub.broadcastServices();
  }

  /**
   * Restart a deployable's container through the docker-socket-proxy: find
   * the container by its compose service label, POST /restart. The proxy is
   * configured to allow nothing else. Never throws — returns the error text.
   */
  async restart(id: ServiceInfo["id"]): Promise<{ ok: boolean; error?: string }> {
    const base = config.dockerProxyUrl.replace(/\/+$/, "");
    if (!base) return { ok: false, error: "kein Docker-Proxy konfiguriert" };
    const service = id === "cms" ? "cms" : id === "realtime" ? "realtime" : id;
    try {
      const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.service=${service}`] }));
      const list = await fetch(`${base}/containers/json?filters=${filters}`, { signal: AbortSignal.timeout(4000) });
      if (!list.ok) return { ok: false, error: `Proxy ${list.status}` };
      const containers = (await list.json()) as { Id: string; Names?: string[] }[];
      const c = containers[0];
      if (!c) return { ok: false, error: `kein Container für ${service}` };
      const res = await fetch(`${base}/containers/${c.Id}/restart?t=5`, { method: "POST", signal: AbortSignal.timeout(30_000) });
      if (!res.ok && res.status !== 204) return { ok: false, error: `Docker ${res.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  start(intervalMs = 15_000): void {
    void this.tick();
    setInterval(() => void this.tick(), intervalMs);
  }
}
