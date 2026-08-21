/**
 * The seat as light actuator. The cabin LAN is air-gapped and will never get
 * an uplink, so the hub — which may run on the VPS — cannot reach the DMX
 * controller. The iPads are the only dual-homed devices (Wi-Fi → hub,
 * USB-C Ethernet → cabin LAN), so the hub decides and the seat performs.
 *
 * The kiosk stays dumb about meaning: it receives finished URLs and fires
 * them. It knows nothing about DMX, playbacks, or what "on" implies — that
 * lives server-side in `apps/realtime/src/cabin/lpu2.ts`.
 *
 * Native calls go through CapacitorHttp, never `fetch`: a WebView request to
 * a plain-HTTP address on the local subnet is exactly the case WKWebView
 * blocks (and it is what triggers the iOS local-network prompt, which needs
 * `NSLocalNetworkUsageDescription` in Info.plist).
 */

import { useEffect } from "react";
import { CapacitorHttp } from "@capacitor/core";
import type { CabinActuation, CabinActuationResult } from "@cosimo/shared";
import { isNative } from "../config/serverUrl";

/** GET one URL, resolving to an error message or null on success. */
async function fire(url: string, timeoutMs: number): Promise<string | null> {
  if (isNative()) {
    const res = await CapacitorHttp.get({ url, connectTimeout: timeoutMs, readTimeout: timeoutMs });
    return res.status >= 200 && res.status < 400 ? null : `http ${res.status}`;
  }
  // Browser dev: the controller is usually unreachable from a dev machine —
  // that is fine, the failure is reported and the control shows degraded.
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return res.ok ? null : `http ${res.status}`;
}

/**
 * Register this seat as the actuator for cabin changes routed to it. The URLs
 * are fired in order and are idempotent, so a repeat (or a second seat firing
 * the same change) is harmless.
 */
export function useCabinActuator(
  setCabinActuator: (
    perform: ((a: CabinActuation) => Promise<CabinActuationResult>) | null,
  ) => void,
): void {
  useEffect(() => {
    const perform = async (actuation: CabinActuation): Promise<CabinActuationResult> => {
      for (const url of actuation.urls) {
        try {
          const error = await fire(url, actuation.timeoutMs);
          // Stop at the first failure: a half-applied sequence is worth
          // reporting as degraded rather than papering over.
          if (error) return { control: actuation.control, ok: false, error };
        } catch (err) {
          return {
            control: actuation.control,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
      return { control: actuation.control, ok: true };
    };

    setCabinActuator(perform);
    return () => setCabinActuator(null);
  }, [setCabinActuator]);
}
