/**
 * Network health monitor. Periodically probes connectivity and reports it to the
 * hub, which auto-switches CoSiMo into offline canned mode when the cloud is
 * unreachable (and back when it returns). The host can still force demo mode
 * independently. Probing is cheap and never throws.
 */

import type { Hub } from "./hub.js";

/** A fast endpoint that returns 204; override via HEALTH_PING_URL. */
const PING_URL = process.env.HEALTH_PING_URL ?? "https://www.gstatic.com/generate_204";
const INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS ?? 15000);

async function probe(): Promise<boolean> {
  // If there's no LLM key, connectivity doesn't change the (already-canned) mode,
  // but we still report it so the operator console reflects reality.
  try {
    await fetch(PING_URL, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

export function startHealthMonitor(hub: Hub): void {
  const tick = async () => {
    hub.setNetwork(await probe());
  };
  void tick();
  setInterval(() => void tick(), INTERVAL_MS);
}
