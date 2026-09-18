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
      // only the scenes array: a global update merges top-level fields, so
      // the address and the playback map stay as they are
      const body = {
        lightScenes: scenes.map((s) => ({ key: s.key, label: s.label, roofline: s.groups.roofline, rooflight: s.groups.rooflight, floor: s.groups.floor })),
      };
      const put = await fetch(`${this.base}/api/globals/cabin-config`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
      return put.ok;
    } catch {
      return false;
    }
  }
}
