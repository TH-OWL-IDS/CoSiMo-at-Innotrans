import type { LightScene } from "@cosimo/shared";
import { config } from "../config.js";

/**
 * Write-back into the operator config: the light scenes the console saves
 * ("als Szene speichern"). Best-effort like the profile sink — a CMS hiccup
 * must never break the cabin; the hub keeps the new scene in memory anyway.
 */
export class ConfigSink {
  private readonly base = config.payload.internalUrl.replace(/\/+$/, "");
  private readonly key = config.payload.internalKey;

  get enabled(): boolean {
    return Boolean(this.base && this.key);
  }

  /** Persist the whole scene list (the CMS array is replaced as one). */
  async saveScenes(scenes: LightScene[]): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const headers = { "Content-Type": "application/json", "x-internal-key": this.key };
      // the cabin group as a whole: Payload replaces the group, so the
      // address and the playback map ride along unchanged
      const res = await fetch(`${this.base}/api/globals/operator-config`, { headers, signal: AbortSignal.timeout(4000) });
      if (!res.ok) return false;
      const doc = (await res.json()) as { cabin?: Record<string, unknown> };
      const cabin = { ...(doc.cabin ?? {}) };
      delete cabin.lightScenes;
      const body = {
        cabin: {
          ...cabin,
          lightScenes: scenes.map((s) => ({ key: s.key, label: s.label, roofline: s.groups.roofline, rooflight: s.groups.rooflight, floor: s.groups.floor })),
        },
      };
      const put = await fetch(`${this.base}/api/globals/operator-config`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
      return put.ok;
    } catch {
      return false;
    }
  }
}
