/**
 * Light-driver abstraction for the one real cabin control (the interior light).
 * The hub talks to this interface; the concrete driver is chosen at startup
 * (fake for dev/offline, Shelly relay over local HTTP for the real cab). This
 * keeps the agent and hub oblivious to the hardware and lets the demo degrade
 * gracefully when the relay is unreachable.
 */

export interface LightDriver {
  readonly kind: "fake" | "shelly";
  /** Turn the light on/off. Throws if the device is unreachable. */
  setOn(on: boolean): Promise<void>;
  /** Read the current state, if the device supports it. */
  getOn?(): Promise<boolean>;
}

/** In-memory light for development and offline canned mode. Never fails. */
export class FakeLightDriver implements LightDriver {
  readonly kind = "fake" as const;
  private on = false;

  async setOn(on: boolean): Promise<void> {
    this.on = on;
    // eslint-disable-next-line no-console
    console.log(`[light:fake] interior light → ${on ? "ON" : "OFF"}`);
  }

  async getOn(): Promise<boolean> {
    return this.on;
  }
}

/**
 * Shelly relay over its local HTTP RPC (Gen2+). Drives any lamp wired to the
 * relay — no cloud dependency. Endpoints:
 *   GET {base}/rpc/Switch.Set?id={id}&on=true|false
 *   GET {base}/rpc/Switch.GetStatus?id={id}  -> { "output": bool, ... }
 */
export class ShellyLightDriver implements LightDriver {
  readonly kind = "shelly" as const;
  private readonly base: string;
  private readonly id: number;
  private readonly timeoutMs = 2500;

  constructor(baseUrl: string, switchId = 0) {
    this.base = baseUrl.replace(/\/+$/, "");
    this.id = switchId;
  }

  async setOn(on: boolean): Promise<void> {
    const url = `${this.base}/rpc/Switch.Set?id=${this.id}&on=${on ? "true" : "false"}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`shelly Switch.Set ${res.status}`);
  }

  async getOn(): Promise<boolean> {
    const url = `${this.base}/rpc/Switch.GetStatus?id=${this.id}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`shelly Switch.GetStatus ${res.status}`);
    const body = (await res.json()) as { output?: boolean };
    return Boolean(body.output);
  }
}

/** Pick the driver from config: Shelly if configured, otherwise the fake. */
export function createLightDriver(
  driver: "fake" | "shelly",
  shellyBaseUrl: string,
): LightDriver {
  if (driver === "shelly" && shellyBaseUrl) {
    return new ShellyLightDriver(shellyBaseUrl);
  }
  return new FakeLightDriver();
}
