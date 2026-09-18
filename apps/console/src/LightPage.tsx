import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import LogView from "./LogView";
import { CircleCheckBig, FlaskConical, Lightbulb, Power, TriangleAlert } from "lucide-react";
import { Button, Tip, cn } from "@cosimo/ui";
import type { CosimoState } from "@cosimo/client";
import {
  RIG_FIXTURES,
  rigDefaultState,
  splitBias,
  type HostConfigBroadcast,
  type LogEvent,
  type RigFixture,
  type RigFixtureState,
} from "@cosimo/shared";

/**
 * The Licht view (its own tab): the light rig, fixture by fixture — the
 * installer's own test page (MESO, lighting-test.html) rebuilt on our stack. Same controls per
 * fixture (toggle · intensity · CW/WW bias; RGB + exclusive modes on the
 * signal light), same command semantics (shared rig.ts), but the address
 * and playbacks come from the CMS, an iPad in the cabin LAN fires the
 * URLs, the hub keeps the state for every console, and each fixture shows
 * whether the controller answered. Beneath it, the light's own log: every
 * cabin.* event, in the full log view (filter, export).
 */

const DEBOUNCE_MS = 80;

function pb(n: number | null | undefined): string {
  return n != null ? `pb${String(n).padStart(2, "0")}` : "—";
}

function biasLabel(bias: number): string {
  if (bias === 0) return "50 / 50";
  return bias > 0 ? `kalt +${bias} %` : `warm +${Math.abs(bias)} %`;
}

function Slider({ label, value, min, max, onChange, onCommit, format, disabled }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; onCommit: () => void;
  format: (v: number) => string; disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex justify-between text-2xs uppercase tracking-caps text-mute">
        <span>{label}</span>
        <span className="tabular-nums text-ink">{format(value)}</span>
      </span>
      <input
        type="range" min={min} max={max} step={1} value={value} disabled={disabled}
        onChange={(e) => { onChange(Number(e.target.value)); onCommit(); }}
        className="w-full accent-ink disabled:opacity-40"
      />
    </label>
  );
}

function FixtureRow({ f, state, result, playback, mapped, disabled, onAction }: {
  f: RigFixture;
  state: RigFixtureState;
  result?: { ok: boolean; error?: string; at: number; urls: string[] };
  playback: (key: string) => number | null;
  mapped: boolean;
  disabled: boolean;
  onAction: (action: "on" | "off" | "levels" | "mode", state: RigFixtureState) => void;
}) {
  // local copy while the operator drags; the hub's copy wins when it changes
  const [local, setLocal] = useState(state);
  useEffect(() => setLocal(state), [state]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<RigFixtureState>(local);
  pending.current = local;
  const commitLevels = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("levels", pending.current), DEBOUNCE_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = (patch: Partial<RigFixtureState>) => setLocal((s) => ({ ...s, ...patch }));

  const channels =
    f.kind === "single" ? `${pb(playback(f.key))}`
      : f.kind === "pair" ? `CW ${pb(playback(f.cw))} · WW ${pb(playback(f.ww))}`
        : `CW ${pb(playback(f.cw))} · WW ${pb(playback(f.ww))} · RGB ${pb(playback(f.rgb.red))} ${pb(playback(f.rgb.green))} ${pb(playback(f.rgb.blue))}`;
  const split = f.kind === "single" ? null : splitBias(local.intensity, local.bias);
  const dead = disabled || !mapped;

  return (
    <div className={cn("grid items-start gap-3 rounded-lg border border-line bg-white p-3", f.kind === "combined" ? "md:grid-cols-[180px_1fr_1fr_1.2fr]" : f.kind === "single" ? "md:grid-cols-[180px_1fr]" : "md:grid-cols-[180px_1fr_1fr]")}>
      <div className="flex flex-col gap-1.5">
        <Button
          variant={local.on ? "on" : "secondary"}
          size="sm"
          className="justify-start"
          disabled={dead}
          onClick={() => onAction(local.on ? "off" : "on", { ...local, on: !local.on })}
        >
          <Power size={14} /> {f.label}
        </Button>
        <span className="text-2xs tabular-nums text-mute">{mapped ? channels : <span className="text-warn">nicht im CMS</span>}</span>
        {result && (
          <Tip tip={result.urls.length ? result.urls.map((u) => u.replace(/^https?:\/\/[^/]+/, "")).join("\n") : result.error ?? ""}>
            <span className={cn("flex items-center gap-1 text-2xs", result.ok ? "text-ok" : "text-warn")}>
              {result.ok ? <CircleCheckBig size={11} /> : <TriangleAlert size={11} />}
              {result.ok ? "gesendet" : result.error ?? "fehlgeschlagen"} · {new Date(result.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </Tip>
        )}
      </div>
      <Slider label="Intensität" value={local.intensity} min={0} max={100} disabled={dead} format={(v) => `${v} %`} onChange={(v) => set({ intensity: v })} onCommit={commitLevels} />
      {f.kind !== "single" && (
        <Slider
          label="kalt / warm" value={local.bias} min={-100} max={100} disabled={dead}
          format={(v) => `${biasLabel(v)}${split ? ` · CW ${split.cw} / WW ${split.ww}` : ""}`}
          onChange={(v) => set({ bias: v })} onCommit={commitLevels}
        />
      )}
      {f.kind === "combined" && (
        <div className="flex flex-col gap-2">
          {(["red", "green", "blue"] as const).map((ch) => (
            <Slider
              key={ch} label={ch === "red" ? "Rot" : ch === "green" ? "Grün" : "Blau"}
              value={local.rgb?.[ch] ?? 0} min={0} max={100} disabled={dead} format={(v) => `${v} %`}
              onChange={(v) => set({ rgb: { red: 0, green: 0, blue: 0, ...local.rgb, [ch]: v } })} onCommit={commitLevels}
            />
          ))}
          <div className="flex flex-col gap-1">
            <span className="text-2xs uppercase tracking-caps text-mute">Modi · exklusiv</span>
            <div className="grid grid-cols-2 gap-1.5">
              {f.modes.map((m) => (
                <Button
                  key={m.key} size="xs" variant={local.mode === m.key ? "on" : "secondary"} disabled={dead}
                  onClick={() => { const next = { ...local, mode: local.mode === m.key ? null : m.key }; setLocal(next); onAction("mode", next); }}
                >
                  {m.label} <span className="ml-auto tabular-nums opacity-70">{pb(playback(m.key))}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LightPage({ c, cfg, lightOk, riderSection, onClearLogs, onReplayLogs }: {
  c: CosimoState;
  cfg: HostConfigBroadcast | null;
  /** status.light: address known and the last physical switch confirmed. */
  lightOk: boolean | undefined;
  /** The rider-facing controls (Kabine / Sitze), rendered above the rig. */
  riderSection?: ReactNode;
  onClearLogs: () => void;
  onReplayLogs: () => void;
}) {
  const routes = cfg?.cabin.routes ?? [];
  const playback = (key: string) => routes.find((r) => r.key === key)?.playback ?? null;
  const host = cfg?.cabin.lpu2BaseUrl ? cfg.cabin.lpu2BaseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") : "";
  const noAddress = Boolean(cfg) && !cfg!.cabin.lpu2BaseUrl;
  const noActuator = c.seats.length === 0;
  const disabled = !cfg || noAddress;

  const keysOf = (f: RigFixture): string[] =>
    f.kind === "single" ? [f.key] : f.kind === "pair" ? [f.cw, f.ww] : [f.cw, f.ww, f.rgb.red, f.rgb.green, f.rgb.blue, ...f.modes.map((m) => m.key)];
  const isMapped = (f: RigFixture) => keysOf(f).some((k) => playback(k) != null);

  const act = (f: RigFixture) => (action: "on" | "off" | "levels" | "mode", state: RigFixtureState) => c.hostRig({ fixture: f.id, action, state });
  const allOff = () => {
    for (const f of RIG_FIXTURES) {
      const s = c.rig?.fixtures[f.id] ?? rigDefaultState(f);
      if (s.on || (f.kind === "combined" && s.mode)) c.hostRig({ fixture: f.id, action: "off", state: { ...s, on: false, mode: null } });
    }
  };

  // the light's own log: everything the cabin controller path produced —
  // rider switches, the rig page, the kiosk operator menu, results
  const lightLogs = useMemo(
    () => (c.logs as LogEvent[]).filter((e) => e.kind === "cabin.actuate" || e.kind === "cabin.result" || (e.kind === "host.action" && /light|hello|blackout|release/i.test(String(e.data.action)))),
    [c.logs],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-auto text-base font-normal">
          <b><Lightbulb size={14} className="-mb-0.5 inline" /> Licht</b>{" "}
          <span className={cn(!cfg ? "text-mute" : noAddress ? "text-warn" : lightOk ? "text-ok" : "text-mute")}>
            · {!cfg ? "startet" : noAddress ? "keine LPU-2-Adresse im CMS" : `LPU-2 ${host} · ${cfg.cabin.timeoutMs} ms Timeout${lightOk ? " · ok" : " · nicht bestätigt"}`}
            {noActuator && cfg && !noAddress ? " · kein iPad verbunden, das schalten könnte" : ""}
          </span>
        </h2>
        <Button size="xs" variant="secondary" disabled={disabled} onClick={() => c.hostLight("hello")}><FlaskConical size={13} /> LPU-2 testen</Button>
        <Button size="xs" variant="secondary" disabled={disabled} onClick={() => c.hostLight("blackout", true)}>Blackout an</Button>
        <Button size="xs" variant="secondary" disabled={disabled} onClick={() => c.hostLight("blackout", false)}>Blackout aus</Button>
        <Button size="xs" variant="secondary" disabled={disabled} onClick={allOff}>Alles aus</Button>
        <Button size="xs" variant="secondary" tone="accent" disabled={disabled} onClick={() => { if (window.confirm("Alle Playbacks releasen? Die Standalone-Szene übernimmt.")) c.hostLight("release-all"); }}>Alles releasen</Button>
      </div>

      {riderSection && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3">
          <span className="text-2xs uppercase tracking-caps text-mute">Fahrgast-Steuerung (Zustand, wie CoSiMo ihn sieht)</span>
          {riderSection}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <span className="text-2xs uppercase tracking-caps text-mute">Rig · Adresse und Playbacks aus dem CMS · Intensität 0–100 % → 0–255 am Gerät</span>
        {RIG_FIXTURES.map((f) => (
          <FixtureRow
            key={f.id}
            f={f}
            state={c.rig?.fixtures[f.id] ?? rigDefaultState(f)}
            result={c.rig?.results[f.id]}
            playback={playback}
            mapped={isMapped(f)}
            disabled={disabled}
            onAction={act(f)}
          />
        ))}
        <span className="text-xs text-mute">
          Ein heißt „go“ auf allen Playbacks der Leuchte plus die Pegel, Aus heißt „re“ (die Standalone-Szene übernimmt). Pegel wirken nur auf laufende Playbacks. Die roten Modi schließen sich aus. Was der Fahrgast über CoSiMo erreicht, steht oben; Signale, Außen und Blackout nur hier.
        </span>
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-2xs uppercase tracking-caps text-mute">Licht-Log · jede Schaltung und jede Antwort des iPads</span>
        <LogView logs={lightLogs} onClear={onClearLogs} onReplay={onReplayLogs} />
      </section>
    </div>
  );
}
