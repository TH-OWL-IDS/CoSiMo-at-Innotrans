import { useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, Pencil, Save, Undo2 } from "lucide-react";
import { Button, cn } from "@cosimo/ui";
import LogView from "./LogView";
import type { CosimoState } from "@cosimo/client";
import {
  LIGHT_GROUPS,
  RIG_FIXTURES,
  rigDefaultState,
  sameLevels,
  sceneLevels,
  splitBias,
  type CabinLightState,
  type HostConfigBroadcast,
  type LightGroup,
  type LightScene,
  type LogEvent,
  type RigFixture,
  type RigFixtureState,
} from "@cosimo/shared";

/**
 * The Licht view: four cards — the three scenes and "Alles aus". A scene
 * card switches the cabin and opens its settings beneath: the three groups
 * (Lichtlinien · Deckenpaneel · Boden) with on/off, brightness and
 * cold/warm. Every slider move goes to the cabin at once (the light shows
 * it); the cabin is then "frei" until "speichern" writes the values into
 * the scene (CMS) or "verwerfen" re-applies the stored scene.
 *
 * The settings list EVERY fixture of the rig (the installer's model: on/off
 * · brightness · cold/warm, the signal light with RGB + the exclusive red
 * modes) — all of them belong to the scene; the three interior groups are
 * the ones the rider / CoSiMo can reach too. Driven through the hub's rig
 * state (`host:rig`, the same level objects as the scenes). Beneath, the log.
 */


// slider moves are collected and sent after this pause — every send is a
// burst of LPU-2 calls through an iPad, so dragging must not flood the rig
const DEBOUNCE_MS = 250;

/** The I/O switch on a card: shows on/off and switches it; the card itself only opens the settings. */
function Switch({ on, disabled, onToggle, label }: { on: boolean; disabled?: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={on ? "ausschalten" : "einschalten"}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        "relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border font-mono text-xs font-bold transition-colors disabled:opacity-45",
        on ? "border-ok bg-ok text-white" : "border-line-strong bg-well-deep text-mute",
      )}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]", on ? "left-8" : "left-0.5")} aria-hidden />
      <span className={cn("absolute", on ? "left-2" : "right-2")} aria-hidden>{on ? "I" : "O"}</span>
    </button>
  );
}

/** One scene's three groups as bars: length = brightness, tint = warm … cold. */
function ScenePreview({ groups }: { groups: LightScene["groups"] }) {
  const tint = (bias: number) => (bias < -30 ? "#e8b96a" : bias > 30 ? "#a9c8f0" : "#d9d9d4");
  return (
    <span className="flex w-full flex-col gap-1" aria-hidden>
      {LIGHT_GROUPS.map((g) => {
        const lv = groups[g] ?? { on: false, intensity: 0, bias: 0 };
        return (
          <span key={g} className="flex items-center gap-1.5">
            <span className="w-3 shrink-0 text-2xs text-mute">{g === "roofline" ? "≡" : g === "rooflight" ? "▭" : "▁"}</span>
            <span className="h-1.5 flex-1 rounded-full bg-well-deep">
              <span className="block h-full rounded-full" style={{ width: `${lv.on ? lv.intensity : 0}%`, background: tint(lv.bias) }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Slider({ label, value, min, max, step = 1, format, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  format: (v: number) => string; disabled?: boolean; onChange: (v: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex justify-between text-2xs uppercase tracking-caps text-mute">
        <span>{label}</span>
        <span className="tabular-nums text-ink">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink disabled:opacity-40" />
    </label>
  );
}


/** One fixture of the open scene: on/off · brightness · cold/warm (· RGB + modes) — live on the cabin. */
function FixtureRow({ f, state, disabled, playback, riderReachable = false, onAction }: {
  f: RigFixture;
  state: RigFixtureState;
  disabled: boolean;
  playback: (key: string) => number | null;
  /** The three interior groups: the rider and CoSiMo can set these too. */
  riderReachable?: boolean;
  onAction: (action: "on" | "off" | "levels" | "mode", state: RigFixtureState) => void;
}) {
  const [local, setLocal] = useState(state);
  useEffect(() => setLocal(state), [state]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(local);
  pending.current = local;
  const queue = (patch: Partial<RigFixtureState>) => {
    setLocal((s) => ({ ...s, ...patch }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("levels", pending.current), DEBOUNCE_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const keys = f.kind === "single" ? [f.key] : f.kind === "pair" ? [f.cw, f.ww] : [f.cw, f.ww, f.rgb.red, f.rgb.green, f.rgb.blue];
  const mapped = keys.some((k) => playback(k) != null);
  const dead = disabled || !mapped;
  const biasLabel = (b: number) => (b === 0 ? "50 / 50" : b > 0 ? `kalt +${b} %` : `warm +${Math.abs(b)} %`);
  const split = f.kind === "single" ? null : splitBias(local.intensity, local.bias);
  return (
    <div className="flex flex-col gap-3">
      <div className={cn("grid items-center gap-3", f.kind === "single" ? "md:grid-cols-[200px_1fr]" : "md:grid-cols-[200px_1fr_1fr]")}>
        <div className="flex flex-col gap-1">
          <Button variant={local.on ? "on" : "secondary"} size="sm" className="justify-start" disabled={dead} onClick={() => onAction(local.on ? "off" : "on", { ...local, on: !local.on })}>
            <Lightbulb size={14} /> {f.label}
          </Button>
          <span className="text-2xs tabular-nums text-mute">
            {mapped ? keys.map((k) => `pb${String(playback(k) ?? "--").padStart(2, "0")}`).join(" · ") : <span className="text-warn">nicht im CMS</span>}
            {riderReachable ? " · auch Fahrgast / CoSiMo" : " · nur Personal"}
          </span>
        </div>
        <Slider label="Helligkeit" value={local.intensity} min={0} max={100} step={5} disabled={dead} format={(v) => `${v} %`} onChange={(v) => queue({ intensity: v })} />
        {f.kind !== "single" && (
          <Slider label="kalt / warm" value={local.bias} min={-100} max={100} step={10} disabled={dead} format={(v) => `${biasLabel(v)}${split ? ` · CW ${split.cw} / WW ${split.ww}` : ""}`} onChange={(v) => queue({ bias: v })} />
        )}
      </div>
      {f.kind === "combined" && (
        <div className="grid gap-3 md:grid-cols-[200px_1fr_1fr]">
          <span className="text-2xs uppercase tracking-caps text-mute md:pt-1">Farbe und Modi</span>
          <div className="flex flex-col gap-2">
            {(["red", "green", "blue"] as const).map((ch) => (
              <Slider key={ch} label={ch === "red" ? "Rot" : ch === "green" ? "Grün" : "Blau"} value={local.rgb?.[ch] ?? 0} min={0} max={100} step={5} disabled={dead} format={(v) => `${v} %`} onChange={(v) => queue({ rgb: { red: 0, green: 0, blue: 0, ...local.rgb, [ch]: v } })} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5 self-start">
            {f.modes.map((m) => (
              <Button key={m.key} size="xs" variant={local.mode === m.key ? "on" : "secondary"} disabled={dead} onClick={() => { const next = { ...local, mode: local.mode === m.key ? null : m.key }; setLocal(next); onAction("mode", next); }}>
                {m.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LightPage({ c, cfg, lightOk, onClearLogs, onReplayLogs }: {
  c: CosimoState;
  cfg: HostConfigBroadcast | null;
  /** status.light: address known and the last physical switch confirmed. */
  lightOk: boolean | undefined;
  onClearLogs: () => void;
  onReplayLogs: () => void;
}) {
  const light: CabinLightState | null = c.light;
  const scenes = light?.scenes ?? [];
  const host = cfg?.cabin.lpu2BaseUrl ? cfg.cabin.lpu2BaseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") : "";
  const noAddress = Boolean(cfg) && !cfg!.cabin.lpu2BaseUrl;
  const disabled = !cfg || !light;

  // the open card: set when a scene is tapped, kept while the cabin drifts "frei"
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (light?.scene && light.scene !== "off") setOpen(light.scene); else if (light?.scene === "off") setOpen(null); }, [light?.scene]);
  const openScene = scenes.find((s) => s.key === open) ?? null;
  const free = light?.scene === null;
  const dirty = Boolean(openScene && light && free && !sameLevels(light.groups, sceneLevels(openScene)));
  const routes = cfg?.cabin.routes ?? [];
  const playback = (key: string) => routes.find((r) => r.key === key)?.playback ?? null;
  const rigState = (f: RigFixture) => c.rig?.fixtures[f.id] ?? rigDefaultState(f);
  const [label, setLabel] = useState("");
  useEffect(() => setLabel(openScene?.label ?? ""), [openScene?.key, openScene?.label]);
  const renamed = Boolean(openScene && label.trim() && label.trim() !== openScene.label);

  const save = () => {
    if (!openScene) return;
    c.saveScene({ key: openScene.key, ...(renamed ? { label: label.trim() } : {}), ...(dirty ? {} : { keepLevels: true }) });
  };

  // the light's own log
  const lightLogs = useMemo(
    () => (c.logs as LogEvent[]).filter((e) => e.kind === "cabin.actuate" || e.kind === "cabin.result" || (e.kind === "host.action" && /light|scene|hello|blackout|release/i.test(String(e.data.action)))),
    [c.logs],
  );

  return (
    <div className="flex flex-col gap-6">
      <h2 className="m-0 text-base font-normal">
        <b><Lightbulb size={14} className="-mb-0.5 inline" /> Licht</b>{" "}
        <span className={cn(!cfg ? "text-mute" : noAddress ? "text-warn" : lightOk ? "text-ok" : "text-mute")}>
          · {!cfg ? "startet" : noAddress ? "keine LPU-2-Adresse im CMS — nur simuliert" : `LPU-2 ${host}${lightOk ? " · ok" : " · nicht bestätigt"}`}
          {light ? ` · ${light.scene === "off" ? "aus" : light.scene ? scenes.find((s) => s.key === light.scene)?.label ?? light.scene : "frei"}` : ""}
          {c.seats.length === 0 && cfg && !noAddress ? " · kein iPad verbunden, das schalten könnte" : ""}
        </span>
      </h2>

      {/* the four cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {scenes.map((sc) => {
          const active = light?.scene === sc.key;
          const isOpen = open === sc.key;
          return (
            <div
              key={sc.key}
              role="button"
              tabIndex={0}
              onClick={() => setOpen(isOpen ? null : sc.key)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isOpen ? null : sc.key); } }}
              className={cn(
                "flex cursor-pointer flex-col gap-3 rounded-lg border p-4 text-left transition-colors",
                isOpen ? "border-ink bg-white" : "border-line bg-white hover:bg-well",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-lg font-semibold">{sc.label}</span>
                <Switch on={active} disabled={disabled} label={`${sc.label} ein/aus`} onToggle={() => c.setLight({ scene: active ? "off" : sc.key })} />
              </span>
              <ScenePreview groups={sc.groups} />
              <span className="text-2xs text-mute">{active ? (free ? "geändert" : "aktiv") : isOpen && free ? "geändert" : "antippen: Einstellungen"}</span>
            </div>
          );
        })}
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4 text-left">
          <span className="flex items-center justify-between gap-2">
            <span className="text-lg font-semibold">Alles aus</span>
            <Switch on={light?.scene === "off"} disabled={disabled} label="Alles aus" onToggle={() => c.setLight({ scene: light?.scene === "off" ? scenes[0]?.key ?? "off" : "off" })} />
          </span>
          <span className="text-2xs text-mute">alle Leuchten aus · ausschalten: zurück auf Szene 1</span>
        </div>
      </div>

      {/* the open scene's settings — live on the cabin */}
      {openScene && light && (
        <section className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <Pencil size={13} className="text-mute" />
              <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Name der Szene" className="rounded-md border border-line-strong bg-white px-2 py-1 text-base font-semibold" />
            </label>
            <span className="text-2xs text-mute">Szene {scenes.findIndex((s) => s.key === openScene.key) + 1} · Taste am Panel schaltet der Reihe nach</span>
            <span className="ml-auto flex gap-2">
              {(dirty || renamed) && (
                <Button size="sm" variant="primary" onClick={save} title={dirty ? "die aktuellen Werte der Kabine in diese Szene schreiben (CMS)" : "umbenennen"}>
                  <Save size={13} /> {dirty ? "Szene speichern" : "Name speichern"}
                </Button>
              )}
              {dirty && (
                <Button size="sm" variant="secondary" onClick={() => c.setLight({ scene: openScene.key })} title="die gespeicherte Szene wieder einspielen">
                  <Undo2 size={13} /> verwerfen
                </Button>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-4">
            {RIG_FIXTURES.map((f) => (
              <FixtureRow
                key={f.id}
                f={f}
                state={light.groups[f.id] ?? rigDefaultState(f)}
                disabled={disabled}
                playback={playback}
                riderReachable={(LIGHT_GROUPS as readonly string[]).includes(f.id)}
                onAction={(action, state) => c.hostRig({ fixture: f.id, action, state })}
              />
            ))}
          </div>
          <span className="text-xs text-mute">
            Jede Änderung geht sofort in die Kabine; alle Leuchten gehören zur Szene. {dirty ? "Die Kabine weicht von der gespeicherten Szene ab — speichern übernimmt alle Werte, verwerfen stellt die Szene wieder her." : "Die Kabine zeigt die gespeicherte Szene."}
          </span>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <span className="text-2xs uppercase tracking-caps text-mute">Licht-Log · jede Schaltung und jede Antwort des iPads</span>
        <LogView logs={lightLogs} onClear={onClearLogs} onReplay={onReplayLogs} />
      </section>
    </div>
  );
}
