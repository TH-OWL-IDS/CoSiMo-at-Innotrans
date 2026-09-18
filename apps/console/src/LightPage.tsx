import { useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, Pencil, Save, Undo2 } from "lucide-react";
import { Button, cn } from "@cosimo/ui";
import LogView from "./LogView";
import type { CosimoState } from "@cosimo/client";
import {
  LIGHT_GROUPS,
  LIGHT_GROUP_LABEL,
  sameLevels,
  type CabinLightState,
  type HostConfigBroadcast,
  type LightGroup,
  type LightScene,
  type LogEvent,
} from "@cosimo/shared";

/**
 * The Licht view: four cards — the three scenes and "Alles aus". A scene
 * card switches the cabin and opens its settings beneath: the three groups
 * (Lichtlinien · Deckenpaneel · Boden) with on/off, brightness and
 * cold/warm. Every slider move goes to the cabin at once (the light shows
 * it); the cabin is then "frei" until "speichern" writes the values into
 * the scene (CMS) or "verwerfen" re-applies the stored scene. Beneath, the
 * light's own log.
 */

const DEBOUNCE_MS = 80;

/** One scene's three groups as bars: length = brightness, tint = warm … cold. */
function ScenePreview({ groups, onDark }: { groups: LightScene["groups"]; onDark: boolean }) {
  const tint = (bias: number) => (bias < -30 ? "#e8b96a" : bias > 30 ? "#a9c8f0" : "#d9d9d4");
  return (
    <span className="flex w-full flex-col gap-1" aria-hidden>
      {LIGHT_GROUPS.map((g) => {
        const lv = groups[g];
        return (
          <span key={g} className="flex items-center gap-1.5">
            <span className={cn("w-3 shrink-0 text-2xs", onDark ? "text-white/60" : "text-mute")}>{g === "roofline" ? "≡" : g === "rooflight" ? "▭" : "▁"}</span>
            <span className={cn("h-1.5 flex-1 rounded-full", onDark ? "bg-white/20" : "bg-well-deep")}>
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

/** One group of the open scene: on/off, brightness, cold/warm — live on the cabin. */
function GroupRow({ id, level, disabled, onSet }: {
  id: LightGroup;
  level: { on: boolean; intensity: number; bias: number };
  disabled: boolean;
  onSet: (patch: { on?: boolean; intensity?: number; bias?: number }) => void;
}) {
  // local while dragging; the hub's copy wins when it changes
  const [local, setLocal] = useState(level);
  useEffect(() => setLocal(level), [level]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ intensity?: number; bias?: number }>({});
  const queue = (patch: { intensity?: number; bias?: number }) => {
    setLocal((s) => ({ ...s, ...patch }));
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { const p = pending.current; pending.current = {}; onSet({ ...p, ...(p.intensity !== undefined ? { on: p.intensity > 0 } : {}) }); }, DEBOUNCE_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const biasLabel = (b: number) => (b === 0 ? "50 / 50" : b > 0 ? `kalt +${b} %` : `warm +${Math.abs(b)} %`);
  return (
    <div className="grid items-center gap-3 md:grid-cols-[160px_1fr_1fr]">
      <Button variant={local.on ? "on" : "secondary"} size="sm" className="justify-start" disabled={disabled} onClick={() => onSet({ on: !local.on })}>
        <Lightbulb size={14} /> {LIGHT_GROUP_LABEL[id].de}
      </Button>
      <Slider label="Helligkeit" value={local.on ? local.intensity : 0} min={0} max={100} step={5} disabled={disabled} format={(v) => `${v} %`} onChange={(v) => queue({ intensity: v })} />
      <Slider label="kalt / warm" value={local.bias} min={-100} max={100} step={10} disabled={disabled || !local.on} format={biasLabel} onChange={(v) => queue({ bias: v })} />
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
  const dirty = Boolean(openScene && light && free && !sameLevels(light.groups, openScene.groups));
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
            <button
              key={sc.key}
              type="button"
              disabled={disabled}
              onClick={() => { setOpen(sc.key); c.setLight({ scene: sc.key }); }}
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-45",
                active ? "border-ink bg-ink text-white" : isOpen ? "border-ink bg-white" : "border-line bg-white hover:bg-well",
              )}
            >
              <span className="text-lg font-semibold">{sc.label}</span>
              <ScenePreview groups={sc.groups} onDark={active} />
              <span className={cn("text-2xs", active ? "text-white/70" : "text-mute")}>{active ? (free ? "geändert" : "aktiv") : isOpen && free ? "geändert" : "antippen: einschalten"}</span>
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setOpen(null); c.setLight({ scene: "off" }); }}
          className={cn("flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-45", light?.scene === "off" ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-well")}
        >
          <span className="text-lg font-semibold">Alles aus</span>
          <span className={cn("text-2xs", light?.scene === "off" ? "text-white/70" : "text-mute")}>Lichtlinien, Deckenpaneel und Boden aus</span>
        </button>
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
          <div className="flex flex-col gap-3">
            {LIGHT_GROUPS.map((g) => (
              <GroupRow key={g} id={g} level={light.groups[g]} disabled={disabled} onSet={(patch) => c.setLight({ group: { id: g, ...patch } })} />
            ))}
          </div>
          <span className="text-xs text-mute">
            Jede Änderung geht sofort in die Kabine. {dirty ? "Die Kabine weicht von der gespeicherten Szene ab — speichern übernimmt die Werte, verwerfen stellt die Szene wieder her." : "Die Kabine zeigt die gespeicherte Szene."}
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
