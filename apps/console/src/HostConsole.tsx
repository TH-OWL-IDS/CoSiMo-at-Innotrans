import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  Wrench,
  FlaskConical,
  Armchair,
  Brain,
  Cable,
  Check,
  Ear,
  Frown,
  IdCard,
  Database,
  LayoutDashboard,
  LifeBuoy,
  Meh,
  Menu,
  MessageCircle,
  Mic,
  Moon,
  RotateCcw,
  RotateCw,
  ScrollText,
  Search,
  Smile,
  TramFront,
  AppWindow,
  Box,
  Monitor,
  RadioTower,
  Route,
  TabletSmartphone,
  Volume2,
  X,
  Zap,
  type LucideIcon,
  TrafficCone,
  DoorOpen,
  Gauge,
  CircleCheck,
  Play,
  Pause,
  Lightbulb,
} from "lucide-react";
import {
  CABIN_CONTROLS,
  type Accommodations,
  type CabinControlId,
  type CabinControlState,
  type ClientKind,
  type ConnectedDevice,
  type ConnectionStatus,
  type ServiceInfo,
  type DeviceHealth,
  type LogEvent,
  type PersonaBroadcast,
  type PersonaKey,
  type SeatInspection,
  type SeatSummary,
  type SpeechTestResult,
} from "@cosimo/shared";
import { useCosimoSocket, type CosimoState } from "@cosimo/client";
import { Brand, Button, Card, Chip, CodeChip, Dot, Eyebrow, KeyValue, SeatGlyph, Select, Tip, cn } from "@cosimo/ui";
import { resolveServerUrl } from "./serverUrl";
import LogView, { Kind, SYSTEM_SEAT, summarize } from "./LogView";
import LightPage from "./LightPage";

/**
 * Die Konsole — the live operator surface, three views behind one header:
 *
 *  ÜBERSICHT  every service the demo depends on, with a detail line.
 *  SESSIONS   the Betrieb card (recover, demo mode, all-seat persona, reset
 *             all — "seats" = every kiosk-role client, the emulator too),
 *             then one full-width card per active seat: its configuration
 *             on the left, the whole conversation on the right.
 *  LOGS       the structured debug stream (LogView).
 *
 * Served by apps/console (its own static service, not the CMS) so it stays
 * up during the show regardless of the CMS. Styling: Tailwind utilities on
 * the @cosimo/ui tokens; the only inline styles left are data-driven.
 */

const REALTIME_URL = resolveServerUrl();
/** The CMS admin, for the link on the CMS card. The console never talks to it. */
const CMS_ADMIN_URL = "https://cms-cosimo.homannjohannes.de/admin";

/** A base URL as the operator reads it: host (+ port), no scheme or path. */
function hostOf(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.host + (u.pathname !== "/" ? u.pathname.replace(/\/+$/, "") : "");
  } catch {
    return url;
  }
}


/**
 * Persona options for a picker, built from the live (CMS-authored) set the
 * realtime service broadcasts. `ensureKey` guarantees the currently-selected
 * key is always an option even if it has since been removed from the set.
 */
function personaOptions(
  personas: PersonaBroadcast[],
  ensureKey?: PersonaKey,
): { key: PersonaKey; label: string }[] {
  const opts = personas.map((p) => ({ key: p.persona, label: p.label || p.persona }));
  if (ensureKey && !opts.some((o) => o.key === ensureKey)) {
    opts.unshift({ key: ensureKey, label: ensureKey });
  }
  return opts;
}

const EMOTION_ICON: Record<string, LucideIcon> = {
  neutral: Meh, happy: Smile, thinking: Brain, listening: Ear,
  speaking: MessageCircle, sleeping: Moon, sad: Frown, surprised: Zap,
};

/** The seat's face, as a quiet 16px stroke icon. */
function Emotion({ emotion }: { emotion: string }) {
  const Icon = EMOTION_ICON[emotion] ?? Meh;
  return <Icon size={16} className="-mb-[3px] inline" aria-label={emotion} />;
}


/* ────────────────────────────────────────────────────────────────
 * ÜBERSICHT — one card per dependency: status, consequence, live facts
 * ──────────────────────────────────────────────────────────────── */

type ServiceState = "ok" | "warn" | "down" | "starting";
/** Docker-style states: healthy / degraded / unhealthy, starting until the first signal. */
const STATE_LABEL: Record<ServiceState, string> = { ok: "healthy", warn: "degraded", down: "unhealthy", starting: "starting" };

const HEALTH_LABEL: Record<DeviceHealth, string> = { ok: "ok", slow: "langsam", stale: "antwortet nicht", lost: "getrennt" };
const healthState = (h: DeviceHealth): ServiceState => (h === "ok" ? "ok" : h === "lost" ? "down" : "warn");

/**
 * One connection, one line: what it is, its id, the last ping, the link
 * health, when it was last heard from. "stale" with recent activity is
 * almost always an old app build that doesn't answer sys:ping yet.
 */
const KIND_LABEL: Record<ClientKind, string> = { kiosk: "Kiosk", emulator: "Emulator", console: "Konsole", journey: "Fahrt-Ansicht" };
const KIND_ICON: Record<ClientKind, LucideIcon> = { kiosk: TabletSmartphone, emulator: AppWindow, console: Monitor, journey: Route };

function DeviceRow({ d, now, onReset, onLogs }: { d: ConnectedDevice; now: number; onReset?: () => void; onLogs?: () => void }) {
  const Icon = KIND_ICON[d.kind];
  const recentActivity = d.lastActivityAt != null && now - new Date(d.lastActivityAt).getTime() < 60_000;
  const note =
    d.health === "stale" && recentActivity ? "aktiv, aber kein Ping — alte App-Version?" :
    d.health === "lost" ? "Verbindung verloren" :
    d.transport === "polling" ? "kein WebSocket — nur Polling" : "";
  const title = [
    `${KIND_LABEL[d.kind]} ${d.deviceId}`,
    `verbunden seit ${clock(d.connectedAt)} · ${d.transport}`,
    d.probedAt ? `Ping ${d.rttMs != null ? `${d.rttMs} ms` : "ohne Antwort"} (${ago(d.probedAt, now)})` : "noch nicht geprüft",
    d.lastActivityAt ? `letzte Aktivität ${ago(d.lastActivityAt, now)}` : null,
    note || null,
  ].filter(Boolean).join("\n");
  return (
    <div className={cn("flex min-w-0 items-center gap-2 text-sm", d.health === "lost" && "opacity-55")}>
      <Icon size={14} className="shrink-0 text-mute" />
      <Tip tip={title} className="min-w-0 flex-1">
        <span className="block truncate">
          {d.deviceId}
          {d.seat && <span className="text-mute"> · Sitz {d.seat}</span>}
          {d.kind !== "kiosk" && <span className="text-mute"> · {KIND_LABEL[d.kind]}</span>}
          {d.active && <span className="text-accent"> · Session</span>}
          {d.showcase && <span className="text-mute"> · Schaustellung</span>}
        </span>
      </Tip>
      <span className="shrink-0 tabular-nums text-mute">{d.rttMs != null ? `${d.rttMs} ms` : "—"}</span>
      {d.transport === "polling" && d.health !== "lost" && <Chip size="xs" className="shrink-0 text-warn">polling</Chip>}
      <span className={cn("inline-flex shrink-0 items-center gap-1.5", d.health === "ok" ? "text-ok" : d.health === "lost" ? "text-accent" : "text-warn")}>
        <Dot size="sm" state={healthState(d.health)} /> {HEALTH_LABEL[d.health]}
      </span>
      {onLogs && (
        <Button icon variant="ghost" size="xs" className="shrink-0 text-mute" aria-label={`Log von ${d.deviceId}`} onClick={onLogs}>
          <ScrollText size={13} />
        </Button>
      )}
      {onReset && d.health !== "lost" && (
        <Button
          icon
          variant="ghost"
          size="xs"
          className="shrink-0 text-mute hover:text-accent"
          aria-label={`${d.deviceId} zurücksetzen`}
          onClick={() => {
            const what = d.kind === "journey" ? "Die Ansicht bekommt die Aufforderung, neu zu laden." : "Der Sitz startet eine neue Session (Standardprofil, schlafendes Gesicht); gespeicherte Sessions bleiben.";
            if (window.confirm(`${KIND_LABEL[d.kind]} ${d.deviceId} zurücksetzen? ${what}`)) onReset();
          }}
        >
          <RotateCcw size={13} />
        </Button>
      )}
    </div>
  );
}

const SERVICE_ICON: Record<ServiceInfo["id"], LucideIcon> = { cms: Database, realtime: Cable, console: Monitor, emulator: AppWindow, journey: Route };

/** One deployable, one line: name, public host, port, dot. Everything else in the tooltip. */
function ServiceRow({ s, now, onRestart, result }: { s: ServiceInfo; now: number; onRestart?: () => void; result?: { ok: boolean; error?: string; at: number } }) {
  const Icon = SERVICE_ICON[s.id];
  const tip = [
    s.label,
    s.publicHost ? `öffentlich: https://${s.publicHost}` : "öffentlich: — (kein Domain-Env, Dev)",
    s.internalUrl ? `intern: ${s.internalUrl}` : "intern: nicht konfiguriert (SERVICE_URL_*)",
    s.port != null ? `Port: ${s.port}` : null,
    s.container ? `Container: ${s.container}` : s.docker ? "Container: —" : "läuft ohne Docker (Dev)",
    s.checkedAt ? `Probe: ${s.latencyMs != null ? `${s.latencyMs} ms` : "keine Antwort"} · ${ago(s.checkedAt, now)}` : "Probe: noch keine",
  ].filter(Boolean).join("\n");
  const state: ServiceState | null = s.status === "ok" ? "ok" : s.status === "down" ? "down" : null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Icon size={14} className="shrink-0 text-mute" />
      <Tip tip={tip} className="min-w-0 flex-1">
        <span className="block truncate">
          {s.label}
          {s.publicHost && <span className="text-mute"> · {s.publicHost}</span>}
        </span>
      </Tip>
      <span className="shrink-0 tabular-nums text-mute">{s.port != null ? `:${s.port}` : ""}</span>
      {s.container && <Box size={12} className="shrink-0 text-mute" aria-label="Docker" />}
      <span className={cn("inline-flex shrink-0 items-center gap-1.5", state === "ok" ? "text-ok" : state === "down" ? "text-accent" : "text-mute")}>
        {state ? <Dot size="sm" state={state} /> : <span className="inline-block size-[7px] rounded-full border border-line" aria-hidden />}
        {state === "ok" ? "ok" : state === "down" ? "down" : "—"}
      </span>
      {result && now - result.at < 15_000 && (
        <span className={cn("shrink-0 text-xs", result.ok ? "text-ok" : "text-accent")} title={result.error}>{result.ok ? "neu gestartet" : "Fehler"}</span>
      )}
      {onRestart && s.restartable && (
        <Button
          icon
          variant="ghost"
          size="xs"
          className="shrink-0 text-mute hover:text-accent"
          aria-label={`${s.label} neu starten`}
          onClick={() => {
            const warn = s.id === "realtime"
              ? "Der Hub startet neu: alle Sitze verlieren kurz die Verbindung, laufende Turns brechen ab."
              : s.id === "cms" ? "Payload braucht 10–30 s; der Hub fährt derweil mit der geladenen Konfiguration weiter." : "Die Seite ist kurz nicht erreichbar.";
            if (window.confirm(`Container „${s.label}“ neu starten? ${warn}`)) onRestart();
          }}
        >
          <RotateCw size={13} />
        </Button>
      )}
    </div>
  );
}

function ServiceCard({ state, name, detail, icon: Icon, facts, children, action }: {
  /** Omit for a card that has no single status of its own (Verbindungen: every row carries one). */
  state?: ServiceState;
  /** A control in the title row (Licht: opens the light panel) — shown instead of the status badge. */
  action?: React.ReactNode;
  name: string;
  /** What this card is about — descriptive, never status (the title's tooltip). */
  detail: string;
  /** Extra content below the facts (e.g. the Verbindung card's device rows). */
  children?: React.ReactNode;
  icon: LucideIcon;
  /** Live facts, label → value; "—" when unknown. */
  facts: [string, React.ReactNode][];
}) {
  return (
    <Card active={state === "down"} className="gap-3">
      {/* what the card is about lives in the title's tooltip */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon size={20} className="shrink-0 text-ink" />
        <Tip tip={detail} className="min-w-0 flex-1">
          <span className="block truncate text-2xl font-black">{name}</span>
        </Tip>
        {action ?? (state && (
          <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-sm", state === "ok" ? "text-ok" : state === "warn" ? "text-warn" : state === "starting" ? "text-mute" : "text-accent")}>
            <Dot state={state} /> {STATE_LABEL[state]}
          </span>
        ))}
      </div>
      {facts.length > 0 && <KeyValue rows={facts} keyWidth="w-[88px]" className="border-t border-line-soft pt-2.5" />}
      {children && <div className={cn("flex flex-col gap-2.5", facts.length === 0 && "border-t border-line-soft pt-2.5")}>{children}</div>}
    </Card>
  );
}

type CabinChange = { on?: boolean; level?: number; scene?: string; flash?: true };

/** The controls of one light, rendered per kind: toggle button, level
 *  slider, scene chips, or a momentary flash button. */
function ControlWidget({ def, state, onChange }: {
  def: (typeof CABIN_CONTROLS)[number];
  state: CabinControlState | undefined;
  onChange: (change: CabinChange) => void;
}) {
  const warn = state?.degraded ? `${def.label.de}: letzter Schaltversuch nicht bestätigt` : null;
  if (def.kind === "level") {
    return (
      <Tip tip={warn} className="flex items-center gap-2">
        <span className={cn("text-xs tabular-nums", state?.degraded ? "text-warn" : "text-mute")}>{state?.level ?? 0} %</span>
        <input
          type="range"
          min={0}
          max={100}
          value={state?.level ?? 0}
          aria-label={def.label.de}
          className="w-28 accent-ink"
          onChange={(e) => onChange({ level: Number(e.target.value) })}
        />
      </Tip>
    );
  }
  if (def.kind === "scene") {
    return (
      <Tip tip={warn} className="flex items-center gap-1">
        {(def.scenes ?? []).map((sc) => (
          <Button key={sc.key} size="xs" variant={state?.scene === sc.key ? "on" : "secondary"} aria-pressed={state?.scene === sc.key} onClick={() => onChange({ scene: sc.key })}>
            {sc.label.de}
          </Button>
        ))}
      </Tip>
    );
  }
  if (def.kind === "flash") {
    return (
      <Button size="sm" variant="secondary" onClick={() => onChange({ flash: true })}>
        {def.label.de}
      </Button>
    );
  }
  return (
    <Tip tip={warn}>
      <Button
        size="sm"
        variant={state?.on ? "on" : "secondary"}
        aria-pressed={Boolean(state?.on)}
        tone={state?.degraded ? "warn" : undefined}
        onClick={() => onChange({ on: !state?.on })}
      >
        {def.label.de} {state?.on ? "an" : "aus"}
      </Button>
    </Tip>
  );
}

/** One row of the light panel: the cabin, a seat, or all seats. */
function LightRow({ label, hint, controls, onSet }: {
  label: string;
  hint: string;
  controls: { def: (typeof CABIN_CONTROLS)[number]; state: CabinControlState | undefined }[];
  onSet: (id: CabinControlId, change: CabinChange) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-line-soft pt-2 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{label}</span>
        <span className="truncate text-xs text-mute">{hint}</span>
      </div>
      {controls.map(({ def, state }) => (
        <ControlWidget key={def.id} def={def} state={state} onChange={(change) => onSet(def.id, change)} />
      ))}
    </div>
  );
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const ms = (v: number | null | undefined) => (v == null ? "—" : `${(v / 1000).toFixed(1)} s`);
const clock = (ts: string | undefined) => (ts ? new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—");
const ago = (ts: string | undefined, now: number) => {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((now - new Date(ts).getTime()) / 1000));
  return s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.round(s / 60)} min` : `um ${clock(ts)}`;
};

/** The last system-level events — no seat, no session: boots, config
 *  (re)loads, service status flips, restarts, journey faults. */
function SystemCard({ logs, now, onOpenLogs }: { logs: LogEvent[]; now: number; onOpenLogs: () => void }) {
  // Keep a longer tail, show six rows, scroll for the rest.
  const system = logs.filter((e) => !e.deviceId && !e.sessionId).slice(-60).reverse();
  return (
    <ServiceCard
      icon={Activity}
      name="System"
      detail="Was der Hub selbst erlebt hat — ohne Bezug zu einem Sitz oder einer Session: Starts, geladene Konfiguration (und was sich darin geändert hat), Statuswechsel von LLM/CMS/Netz, Container-Neustarts, Störungen der Fahrt. Neueste oben, sechs sichtbar, der Rest scrollt; „Alle“ öffnet die Logs mit dem Filter „System“."
      facts={[]}
    >
      {/* six rows tall (text-sm rows + gaps), then it scrolls */}
      <div className="flex max-h-[156px] flex-col gap-1.5 overflow-x-hidden overflow-y-auto pr-1">
        {system.length === 0 && <span className="text-sm text-mute">noch keine System-Ereignisse</span>}
        {system.map((e) => (
          <div key={e.seq} className={cn("flex min-w-0 items-center gap-2 text-sm", e.level === "error" ? "text-accent" : e.level === "warn" ? "text-warn" : "text-ink")}>
            <span className="shrink-0 tabular-nums text-mute">{clock(e.ts)}</span>
            <Kind k={e.kind} />
            <Tip tip={`${e.kind} · ${ago(e.ts, now)}\n${summarize(e)}`} className="min-w-0 flex-1">
              <span className="block truncate">{summarize(e)}</span>
            </Tip>
          </div>
        ))}
      </div>
      <div>
        <Button size="xs" variant="secondary" onClick={onOpenLogs}>
          <ScrollText size={13} /> Alle System-Logs
        </Button>
      </div>
    </ServiceCard>
  );
}

/** The "Testen" row of a speech card: button, then outcome, duration, route — and for TTS a play button. */
function SpeechTest({ kind, result, onTest, disabled, hint, voices = [], onTestVoice }: {
  kind: "tts" | "stt";
  result: SpeechTestResult | "pending" | null;
  onTest: () => void;
  disabled: boolean;
  hint: string;
  /** TTS only: the catalog — one small button per voice, each speaks the test sentence. */
  voices?: { key: string; label: string; gender: "female" | "male" }[];
  onTestVoice?: (key: string) => void;
}) {
  const [pendingVoice, setPendingVoice] = useState<string | null>(null);
  useEffect(() => { if (result !== "pending") setPendingVoice(null); }, [result]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const r = result && result !== "pending" ? result : null;
  const play = () => {
    if (!r?.audioBase64) return;
    audioRef.current?.pause();
    const a = new Audio(`data:${r.mime ?? "audio/mpeg"};base64,${r.audioBase64}`);
    audioRef.current = a;
    void a.play();
  };
  // Play the TTS test sound as soon as it arrives — that is what one tests.
  useEffect(() => { if (kind === "tts" && r?.ok) play(); }, [r]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {kind === "stt" && (
          <Button size="xs" variant="secondary" onClick={() => { setPendingVoice(null); onTest(); }} disabled={disabled || result === "pending"} title={disabled ? hint : undefined}>
            <FlaskConical size={13} /> {result === "pending" ? "testet …" : "Testen"}
          </Button>
        )}
        {r?.audioBase64 && (
          <Button size="xs" variant="secondary" onClick={play}>
            <Play size={13} /> Anhören
          </Button>
        )}
        {disabled && <span className="text-xs text-mute">{hint}</span>}
      </div>
      {voices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {voices.map((v) => (
            <Button
              key={v.key}
              size="xs"
              variant="secondary"
              disabled={disabled || result === "pending"}
              title={`${v.label} (${v.gender === "female" ? "weiblich" : "männlich"}) — Testsatz anhören`}
              className={cn(r?.voice === v.key && r.ok && "border-ink")}
              onClick={() => { setPendingVoice(v.key); onTestVoice?.(v.key); }}
            >
              <Volume2 size={12} /> {pendingVoice === v.key && result === "pending" ? "…" : v.label}
            </Button>
          ))}
        </div>
      )}
      {r && (
        <div className={cn("text-sm", r.ok ? "text-ink" : "text-accent")}>
          <span className={r.ok ? "text-ok" : "text-accent"}>{r.ok ? "ok" : "Fehler"}</span>
          <span className="text-mute"> · {r.voice ? `${voices.find((v) => v.key === r.voice)?.label ?? (r.voice === "default" ? "Standardstimme" : r.voice)} · ` : ""}{(r.ms / 1000).toFixed(1)} s · {hostOf(r.route) || r.route} · {r.model}{r.bytes ? ` · ${Math.round(r.bytes / 1024)} kB` : ""}</span>
          <div className="mt-1 whitespace-pre-wrap break-words">{r.ok ? `„${r.text}“` : r.error}</div>
        </div>
      )}
    </>
  );
}

/** The rider-facing light state (Kabine / alle Sitze / per seat), for the Licht view. */
function RiderLightRows({ c }: { c: CosimoState }) {
  const seatControl = (s: SeatSummary, id: CabinControlId) => s.controls.find((x) => x.id === id);
  const control = (id: CabinControlId): CabinControlState | undefined => {
    if (CABIN_CONTROLS.find((d) => d.id === id)?.scope === "cabin") return c.hostCabin.find((x) => x.id === id);
    const xs = c.seats.map((s) => seatControl(s, id)).filter(Boolean) as CabinControlState[];
    if (!xs.length) return undefined;
    return { id, on: xs.some((x) => x.on), degraded: xs.some((x) => x.degraded) };
  };
  const CABIN_DEFS = CABIN_CONTROLS.filter((d) => d.scope === "cabin");
  const SEAT_DEFS = CABIN_CONTROLS.filter((d) => d.scope === "seat");
  return (
    <>
      <LightRow
        label="Kabine"
        hint={`gilt für alle Sitze${c.seats.length === 0 ? " · kein Sitz verbunden, der schalten könnte" : ""}`}
        controls={CABIN_DEFS.map((d) => ({ def: d, state: c.hostCabin.find((x) => x.id === d.id) }))}
        onSet={(id, change) => c.setCabinControl(c.seats[0]?.deviceId ?? c.deviceId, id, change)}
      />
      {SEAT_DEFS.length > 0 && c.seats.length > 1 && (
        <LightRow
          label="alle Sitze"
          hint={`${c.seats.length} Sitze`}
          controls={SEAT_DEFS.map((d) => ({ def: d, state: control(d.id) }))}
          onSet={(id, change) => c.seats.forEach((s) => c.setCabinControl(s.deviceId, id, change))}
        />
      )}
      {c.seats.map((s) => {
        const kind = c.devices.find((d) => d.deviceId === s.deviceId)?.kind;
        return (
          <LightRow
            key={s.deviceId}
            label={s.deviceId}
            hint={[kind === "emulator" ? "Emulator" : "iPad", s.active ? `${s.personaLabel} · aktiv` : "frei"].join(" · ")}
            controls={SEAT_DEFS.map((d) => ({ def: d, state: seatControl(s, d.id) }))}
            onSet={(id, change) => c.setCabinControl(s.deviceId, id, change)}
          />
        );
      })}
    </>
  );
}

function OverviewTab({ c, st, onShowLogs, onShowSystemLogs, onOpenLight }: { c: CosimoState; st: ConnectionStatus | null; onShowLogs: (deviceId: string) => void; onShowSystemLogs: () => void; onOpenLight: () => void }) {
  // A minute tick, so "vor 40 s" stays honest without the log changing.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const [promptOpen, setPromptOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  // The log stream carries the richer facts: which brain answers, whether the
  // fallback is standing in, how long the last turns took, what the light did.
  const logs = c.logs;
  const last = <K extends LogEvent["kind"]>(kind: K) =>
    [...logs].reverse().find((e): e is Extract<LogEvent, { kind: K }> => e.kind === kind);

  const lastTurnLlm = [...logs].reverse().find((e): e is Extract<LogEvent, { kind: "turn.start" }> => e.kind === "turn.start" && e.data.llm !== null);
  const llmName = lastTurnLlm?.data.llm ? `${lastTurnLlm.data.llm.provider} · ${lastTurnLlm.data.llm.model}` : "noch kein Turn";
  const lastSvc = last("service.status");
  const lastCmsSvc = [...logs].reverse().find((e): e is Extract<LogEvent, { kind: "service.status" }> => e.kind === "service.status" && "cms" in e.data);
  const cfg = c.hostConfig;
  const fallbackActive = Boolean(lastSvc && "llmFallbackActive" in lastSvc.data && lastSvc.data.llmFallbackActive);
  const turns = recent("turn.end");
  const lastTurn = turns[turns.length - 1];
  const llmMs = mean(turns.map((t) => t.data.timings.llmMs).filter((x): x is number => x != null));
  const sttMs = mean(turns.map((t) => t.data.timings.sttMs).filter((x): x is number => x != null));
  const lastStt = last("stt.result");
  // The voice a fresh session starts with: the default persona's choice
  // (CMS → Personas → Standard), resolved against the catalog.
  const defaultAcc = c.personas.find((p) => p.persona === "default")?.accommodations;
  const defaultVoice = !defaultAcc ? "—"
    : defaultAcc.voice
      ? `${cfg?.tts.voiceList.find((v) => v.key === defaultAcc.voice)?.label ?? defaultAcc.voice} (${defaultAcc.voiceGender === "male" ? "männlich" : "weiblich"})`
      : `${defaultAcc.voiceGender === "male" ? "männliche" : "weibliche"} Standardstimme`;
  // The light: what the kiosks reported back after firing the LPU-2 URLs.
  const live = c.devices.filter((d) => d.health !== "lost");
  const kioskIds = live.filter((d) => d.role === "kiosk").map((d) => d.deviceId);
  // Rows: real kiosks, then emulators, then journey views (lost ones last
  // within their group) — the list reads as the cab plus its watchers.
  // Consoles are a counter; the individual ones live in its tooltip.
  const KIND_RANK: Record<ClientKind, number> = { kiosk: 0, emulator: 1, journey: 2, console: 3 };
  const kiosks = c.devices
    .filter((d) => d.kind !== "console")
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || Number(a.health === "lost") - Number(b.health === "lost") || a.deviceId.localeCompare(b.deviceId));
  // Consoles that answered the last ping. A closed tab stays "stale" until
  // the socket's own timeout notices — that is not an active console.
  const hosts = live
    .filter((d) => d.kind === "console" && (d.health === "ok" || d.health === "slow"))
    .sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  const consoleList = hosts.length
    ? hosts.map((d) => `${d.deviceId}${d.deviceId === c.deviceId ? " (diese)" : ""} · ${d.rttMs != null ? `${d.rttMs} ms` : "—"} · ${HEALTH_LABEL[d.health]}`).join("\n")
    : "keine";
  const activeSeats = c.seats.filter((s) => s.active).length;
  const t = c.telemetry;
  const fault = t?.faults?.[0];
  // The journey app's public host, as the hub reports it (dev: its local port).
  const journeySvc = c.services.find((x) => x.id === "journey");
  const journeyUrl = journeySvc?.publicHost ? `https://${journeySvc.publicHost}` : journeySvc?.internalUrl ?? null;

  if (!st) {
    return (
      <div className="flex flex-col gap-6">
        <Card><span className="text-mute">warte auf Status …</span></Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ServiceCard
          icon={Cable}
          name="Verbindungen"
          detail="Wer gerade am Hub hängt. Der Hub pingt alle 2 s jede Verbindung über den Socket und misst die Antwortzeit. Konsolen: die Zahl der Bedien-Oberflächen, die zuletzt geantwortet haben (Details im Tooltip). Darunter jeder Kiosk-Sitz — iPad oder Browser-Emulator — mit Antwortzeit, Transport und Sitz-Status. „Jetzt prüfen“ löst die Messung sofort aus."
          facts={[
            ["Konsolen", <Tip tip={consoleList}><span className="block truncate">{String(hosts.length)}</span></Tip>],
          ]}
        >
          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2.5">
            {kiosks.length === 0 && <span className="text-sm text-mute">keine Sitze oder Ansichten verbunden</span>}
            {kiosks.map((d) => (
              <DeviceRow key={d.deviceId} d={d} now={now} onReset={() => c.resetDevice(d.deviceId)} onLogs={() => onShowLogs(d.deviceId)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="secondary" onClick={() => c.probeDevices()}>
              <RadioTower size={13} /> Jetzt prüfen
            </Button>
            <Button
              size="xs"
              variant="secondary"
              tone="accent"
              onClick={() => {
                if (window.confirm("Alles zurücksetzen? Jeder Sitz startet eine neue Session, alle anderen Konsolen werden zum Neuladen aufgefordert. Gespeicherte Sessions bleiben.")) c.resetAll();
              }}
            >
              <RotateCw size={13} /> Alles zurücksetzen
            </Button>
          </div>
        </ServiceCard>
        <ServiceCard
          icon={Box}
          name="Services"
          detail="Die fünf Deployables aus Sicht des Hubs: CMS (Payload), WS (der Hub selbst), Konsole, Seat-Emulator und Fahrt-Ansicht — je mit öffentlichem Host, internem Port und Compose-Service. Der Hub prüft alle 15 s die interne Adresse; die Details stehen im Tooltip der Zeile."
          facts={[]}
        >
          <div className="flex flex-col gap-1.5">
            {c.services.length === 0 && <span className="text-sm text-mute">warte auf den Hub …</span>}
            {c.services.map((s) => (
              <ServiceRow key={s.id} s={s} now={now} onRestart={() => c.restartService(s.id)} result={c.restartResults[s.id]} />
            ))}
          </div>
        </ServiceCard>
        <SystemCard logs={c.logs} now={now} onOpenLogs={onShowSystemLogs} />
        <ServiceCard
          state={!lastCmsSvc && !cfg ? "starting" : st.cms ? "ok" : "warn"}
          icon={Database}
          name="CMS"
          detail="Die Redaktion: Payload hält Profile (NFC-Karten), Route, Sessions und die Operator-Konfiguration. Der Hub liest sie mit Cache und fährt bei Ausfall mit dem zuletzt Geladenen weiter. Die Zeilen zeigen, welche Routen (LLM, STT, TTS, LPU-2) der Hub daraus gerade fährt."
          facts={[
            ["Status", lastCmsSvc ? `${st.cms ? "erreichbar" : "getrennt"} seit ${clock(lastCmsSvc.ts)}` : st.cms ? "erreichbar" : "getrennt"],
            ["Profile", c.personas.length ? String(c.personas.length) : "—"],
            ["Konfig", cfg ? (cfg.source === "cms" ? `aus dem CMS · ${clock(cfg.loadedAt ?? undefined)}` : <span className="text-warn">env-Defaults</span>) : "—"],
            ["LLM", cfg ? `${cfg.llm.provider} · ${cfg.llm.model}` : "—"],
            ["LLM-Route", cfg ? hostOf(cfg.llm.baseUrl) || (cfg.llm.provider === "anthropic" ? "api.anthropic.com (SDK)" : "—") : "—"],
            ["Fallback", cfg ? (cfg.llm.fallback ? `${cfg.llm.fallback.provider} · ${cfg.llm.fallback.model}` : "keiner") : "—"],
            ["STT-Route", cfg ? `${hostOf(cfg.stt.baseUrl)} · ${cfg.stt.model}` : "—"],
            ["TTS-Route", cfg ? `${hostOf(cfg.tts.baseUrl)} · ${cfg.tts.model}${cfg.tts.voices ? ` · ${cfg.tts.voices} Stimmen` : ""}` : "—"],
            ["LPU-2", cfg ? `${hostOf(cfg.cabin.lpu2BaseUrl) || "—"} · ${cfg.cabin.mapped}/${cfg.cabin.controls} gemappt` : "—"],
            ["Admin", <a href={CMS_ADMIN_URL} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline">Payload öffnen ↗</a>],
          ]}
        />
        <ServiceCard
          state={!lastSvc ? "starting" : st.llm ? (fallbackActive ? "warn" : "ok") : "down"}
          icon={Brain}
          name="LLM"
          detail="Das Gehirn: welches Modell der Hub gerade anspricht, über welche Route und mit welchen Generierungs-Einstellungen (CMS → Operator-Config → LLM → Generierung, wirkt live). „System-Prompt“ zeigt den Prompt, wie ihn ein frischer Turn bekäme (Kern aus dem CMS + Stimmkatalog + Standard-Fahrgast). „Testen“ schickt eine kurze Testanfrage über genau diese Route und zeigt Antwort und Dauer."
          facts={[
            ["LLM", cfg ? `${cfg.llm.provider} · ${cfg.llm.model}${fallbackActive ? " · Fallback aktiv" : ""}` : "—"],
            ["LLM-Route", cfg ? hostOf(cfg.llm.baseUrl) || (cfg.llm.provider === "anthropic" ? "api.anthropic.com (SDK)" : "—") : "—"],
            ["Temperatur", cfg ? cfg.llm.generation.temperature.toLocaleString("de-DE") : "—"],
            ["Top-p", cfg ? cfg.llm.generation.topP.toLocaleString("de-DE") : "—"],
            ["Max. Tokens", cfg ? String(cfg.llm.generation.maxTokens) : "—"],
            ["Wdh.-Strafe", cfg ? cfg.llm.generation.repetitionPenalty.toLocaleString("de-DE") : "—"],
            ["Thinking", cfg ? (cfg.llm.generation.thinking ? <span className="text-warn">an (langsamer)</span> : "aus") : "—"],
          ]}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs" variant="secondary" onClick={() => setPromptOpen(true)} disabled={!cfg?.systemPrompt}>
              <ScrollText size={13} /> System-Prompt
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setToolsOpen(true)} disabled={!cfg?.tools?.length}>
              <Wrench size={13} /> Tools{cfg?.tools?.length ? ` (${cfg.tools.length})` : ""}
            </Button>
            <Button size="xs" variant="secondary" onClick={() => c.testLlm()} disabled={c.llmTest === "pending"}>
              <FlaskConical size={13} /> {c.llmTest === "pending" ? "testet …" : "Testen"}
            </Button>
          </div>
          {c.llmTest && c.llmTest !== "pending" && (
            <div className={cn("text-sm", c.llmTest.ok ? "text-ink" : "text-accent")}>
              <span className={c.llmTest.ok ? "text-ok" : "text-accent"}>{c.llmTest.ok ? "ok" : "Fehler"}</span>
              <span className="text-mute"> · {(c.llmTest.ms / 1000).toFixed(1)} s · {c.llmTest.provider}/{c.llmTest.model}</span>
              <div className="mt-1 whitespace-pre-wrap break-words">{c.llmTest.ok ? `„${c.llmTest.text}“` : c.llmTest.error}</div>
            </div>
          )}
        </ServiceCard>
        <Dialog.Root open={promptOpen} onOpenChange={setPromptOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-drawer bg-ink/10" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-drawer flex max-h-[86vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-xl border border-line bg-white p-4 shadow-drawer focus:outline-none"
              aria-describedby={undefined}
            >
              <div className="flex items-center justify-between">
                <Dialog.Title className="m-0 text-base font-normal">
                  <b><ScrollText size={14} className="-mb-0.5 inline" /> System-Prompt</b>{" "}
                  <span className="opacity-55">· {cfg?.systemPrompt.length ?? 0} Zeichen · {cfg?.source === "cms" ? "Kern aus dem CMS" : "Kern aus den env-Defaults"}</span>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button icon size="sm" aria-label="schließen"><X size={16} /></Button>
                </Dialog.Close>
              </div>
              <pre className="m-0 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-well p-3 text-sm leading-snug">
                {cfg?.systemPrompt}
              </pre>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Dialog.Root open={toolsOpen} onOpenChange={setToolsOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-drawer bg-ink/10" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-drawer flex max-h-[86vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-xl border border-line bg-white p-4 shadow-drawer focus:outline-none"
              aria-describedby={undefined}
            >
              <div className="flex items-center justify-between">
                <Dialog.Title className="m-0 text-base font-normal">
                  <b><Wrench size={14} className="-mb-0.5 inline" /> Tools</b>{" "}
                  <span className="opacity-55">· {cfg?.tools?.length ?? 0} Definitionen, wie sie das Modell bekommt</span>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button icon size="sm" aria-label="schließen"><X size={16} /></Button>
                </Dialog.Close>
              </div>
              <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                {(cfg?.tools ?? []).map((t) => (
                  <details key={t.name} className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm">
                      <b>{t.name}</b>
                      <span className="text-mute"> — {t.description.length > 140 ? `${t.description.slice(0, 140)}…` : t.description}</span>
                    </summary>
                    <p className="mb-2 mt-2 text-sm leading-snug">{t.description}</p>
                    <pre className="m-0 overflow-x-auto rounded-lg border border-line bg-well p-2.5 text-xs leading-snug">{JSON.stringify(t.schema, null, 2)}</pre>
                  </details>
                ))}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <ServiceCard
          state={!t ? "starting" : fault ? "warn" : t.simPaused ? "warn" : "ok"}
          icon={TramFront}
          name="Fahrt"
          detail="Die Fahrt, wie der Hub sie simuliert und an alle Sitze sendet: Ort, Tempo, nächster Halt, aktive Störung, Verspätung, Fahrgäste. „Fahrt-Ansicht“ öffnet die Linien-Visualisierung (journey)."
          facts={[
            ["Ort", t ? `${t.location.de}${t.simPaused ? " · pausiert" : ""}` : "—"],
            ["Geschwindigkeit", t ? `${Math.round(t.speedKmh)} km/h` : "—"],
            ["Nächster Halt", t?.nextStops[0] ? `${t.nextStops[0].name.de} · ${t.nextStops[0].etaMinutes} min` : "—"],
            ["Störung", fault ? <span className="text-warn">{fault.cause.de} ({fault.remainingSec}s)</span> : "keine"],
            ["Verspätung", t?.delayMinutes ? `+${t.delayMinutes} min` : "pünktlich"],
            ["Fahrgäste", t ? `${t.occupancy}/${t.capacity} (${t.seats?.liveSessions ?? 0} echt)` : "—"],
            ["Ansicht", journeyUrl ? <a href={journeyUrl} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline">Fahrt-Ansicht öffnen ↗</a> : "—"],
          ]}
        >
          {/* faults are host-only: the demo decides when something goes wrong */}
          <div className="flex flex-wrap gap-2">
            {([
              ["signal-hold", "Signalhalt", TrafficCone],
              ["door-fault", "Türstörung", DoorOpen],
              ["slow-order", "Langsamfahrt", Gauge],
            ] as const).map(([kind, label, Icon]) => (
              <Button
                key={kind}
                size="xs"
                variant="secondary"
                disabled={!t || fault?.kind === kind}
                title={`${label} auslösen (Standarddauer)`}
                onClick={() => c.patchTelemetry({ fault: { kind } })}
              >
                <Icon size={13} /> {label}
              </Button>
            ))}
            <Button size="xs" variant="secondary" tone="accent" disabled={!fault} onClick={() => c.patchTelemetry({ clearFaults: true })}>
              <CircleCheck size={13} /> Störung beenden
            </Button>
            <Button size="xs" variant="secondary" disabled={!t} onClick={() => c.patchTelemetry({ paused: !t?.simPaused })}>
              {t?.simPaused ? <Play size={13} /> : <Pause size={13} />} {t?.simPaused ? "Fahrt fortsetzen" : "Fahrt pausieren"}
            </Button>
          </div>
        </ServiceCard>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ServiceCard
          icon={Lightbulb}
          name="Licht"
          detail="Das Kabinenlicht hat seine eigene Seite: Steuerung jeder Leuchte, Adresse und Playbacks aus dem CMS, das Licht-Log."
          facts={[]}
          action={
            <Button size="sm" variant="secondary" className="shrink-0" onClick={onOpenLight}>
              <Lightbulb size={14} /> Lichtsteuerung
            </Button>
          }
        />
        <ServiceCard
          state={st.serverTts ? "ok" : "warn"}
          icon={Volume2}
          name="Sprechen (TTS)"
          detail="Sprachausgabe: ob die Stimme auf dem Server (ElevenLabs) erzeugt und als Audio an den Sitz gestreamt wird oder das iPad mit der Systemstimme spricht. „Erstes Audio“ ist die Zeit bis zum ersten hörbaren Satz."
          facts={[
            ["Pfad", st.serverTts ? "ElevenLabs (Server)" : <span className="text-warn">Systemstimme auf dem iPad</span>],
            ["TTS-Route", cfg ? `${hostOf(cfg.tts.baseUrl)} · ${cfg.tts.model}` : "—"],
            ["Standardstimme", defaultVoice],
            ["Stimmen", cfg ? `${cfg.tts.voices} im Katalog (CMS)` : "—"],
          ]}
        >
          <SpeechTest kind="tts" result={c.ttsTest} onTest={() => c.testTts()} disabled={!st.serverTts} hint="kein Server-TTS — nichts zu testen" voices={cfg?.tts.voiceList ?? []} onTestVoice={(k) => c.testTts(k)} />
        </ServiceCard>
        <ServiceCard
          state="ok"
          icon={Mic}
          name="Hören (STT)"
          detail="Spracherkennung. Standard ist das Diktat auf dem iPad selbst (Web Speech) — dann sieht der Server nur Text. Ist Server-STT konfiguriert (DEEPGRAM_API_KEY), laden die Sitze die Aufnahme hoch und Deepgram erkennt. „Testen“ lässt die TTS einen Testsatz sprechen und schickt ihn durch die Erkennung — ein Round-Trip ohne Mikrofon."
          facts={[
            ["Pfad", st.serverStt ? "Deepgram (Server)" : "Diktat auf dem iPad (Standard)"],
            ["STT-Route", cfg ? (st.serverStt ? `${hostOf(cfg.stt.baseUrl)} · ${cfg.stt.model}` : <span className="text-mute">{hostOf(cfg.stt.baseUrl)} · {cfg.stt.model} (nicht aktiv)</span>) : "—"],
            ["Ø Dauer", ms(sttMs)],
            ["Zuletzt", lastStt ? `${ago(lastStt.ts, now)} · ${lastStt.data.chars} Zeichen aus ${Math.round(lastStt.data.bytes / 1024)} kB` : "—"],
          ]}
        >
          <SpeechTest kind="stt" result={c.sttTest} onTest={c.testStt} disabled={!st.serverStt || !st.serverTts} hint={!st.serverStt ? "kein Server-STT — die iPads diktieren lokal" : "kein Server-TTS für das Testaudio"} />
        </ServiceCard>
      </div>
    </div>
  );
}/* ────────────────────────────────────────────────────────────────
 * SESSIONS — the seats and their conversations
 * ──────────────────────────────────────────────────────────────── */

/**
 * Deep view of one seat: the exact live system prompt and the recorded
 * conversation incl. tool calls, outcomes and latencies. Auto-refreshes
 * while open so a running turn appears as it happens. A modal side
 * dialog: focus is trapped, Esc and the scrim close it, the page behind
 * doesn't scroll.
 */
function InspectorDrawer({
  inspection,
  onRefresh,
  onClose,
}: {
  inspection: SeatInspection;
  onRefresh: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setInterval(onRefresh, 2000);
    return () => clearInterval(t);
  }, [onRefresh]);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-drawer bg-ink/10" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-drawer flex w-[min(520px,92vw)] flex-col gap-3 overflow-hidden border-l border-line bg-white p-4 shadow-drawer focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="m-0 text-base font-normal">
              <b><Search size={14} className="-mb-0.5 inline" /> {inspection.deviceId}</b>{" "}
              <span className="opacity-55">
                · {inspection.persona} · {inspection.sessionId || "keine Session"}
              </span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button icon size="sm" aria-label="schließen"><X size={16} /></Button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto">
            <details>
              <summary className="cursor-pointer text-md opacity-85">
                Systemprompt ({inspection.systemPrompt.length} Zeichen)
              </summary>
              <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-well p-2.5 text-sm leading-snug">
                {inspection.systemPrompt}
              </pre>
            </details>

            <div className="flex flex-col gap-2.5">
              <Eyebrow>Verlauf ({inspection.turns.length} Turns)</Eyebrow>
              {inspection.turns.length === 0 && (
                <span className="text-md opacity-40">noch keine Unterhaltung</span>
              )}
              {inspection.turns.map((t, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-lg border border-line px-2.5 py-2 text-md">
                  <div className="flex justify-between text-xs opacity-70">
                    <span className={t.role === "user" ? "text-ok" : "text-ink"}>
                      {t.role === "user" ? "Gast" : "CoSiMo"} · {t.modality} · {t.lang}
                    </span>
                    <span>
                      {t.faceEmotion ? `${t.faceEmotion} · ` : ""}
                      {t.latencyMs != null ? `${(t.latencyMs / 1000).toFixed(1)}s · ` : ""}
                      {t.outcome ?? ""}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap">{t.transcript || <i className="opacity-40">(leer)</i>}</div>
                  {(t.actions ?? (t.action ? [t.action] : [])).map((a, j) => (
                    <CodeChip key={j} title={a.result} tone={a.ok === false ? "error" : "default"}>
                      ⚙ {a.tool}
                      {a.control ? ` ${a.control}` : ""}
                      {a.args ? ` ${JSON.stringify(a.args)}` : ""}
                      {a.result ? ` → ${a.result.length > 160 ? `${a.result.slice(0, 160)}…` : a.result}` : ""}
                      {a.durationMs != null ? ` · ${a.durationMs} ms` : ""}
                    </CodeChip>
                  ))}
                  {t.error && <CodeChip tone="error">✖ {t.error}</CodeChip>}
                </div>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * One turn of a seat's conversation, rebuilt from the log stream: the
 * rider's text (turn.start), the tool calls in between, CoSiMo's reply
 * (turn.end) — and the slit cards shown/answered along the way.
 */
interface ConvoTurn {
  turn: number;
  user?: { text: string; modality: string; ts: string };
  tools: { tool: string; input: Record<string, unknown>; ok: boolean; durationMs: number }[];
  cards: string[];
  reply?: { text: string; outcome: string; latencyMs: number; error?: string; ts: string };
}

/** The latest session's turns at a device, oldest first. */
function conversationOf(logs: LogEvent[], deviceId: string): ConvoTurn[] {
  const mine = logs.filter((e) => e.deviceId === deviceId && e.sessionId);
  const lastSession = mine.length ? mine[mine.length - 1]!.sessionId : undefined;
  const turns = new Map<number, ConvoTurn>();
  const get = (n: number) => {
    let t = turns.get(n);
    if (!t) { t = { turn: n, tools: [], cards: [] }; turns.set(n, t); }
    return t;
  };
  for (const e of mine) {
    if (e.sessionId !== lastSession || e.turn == null) continue;
    if (e.kind === "turn.start") get(e.turn).user = { text: e.data.text, modality: e.data.modality, ts: e.ts };
    else if (e.kind === "tool.call") get(e.turn).tools.push({ tool: e.data.tool, input: e.data.input, ok: e.data.ok, durationMs: e.data.durationMs });
    else if (e.kind === "card.show") get(e.turn).cards.push(`${e.data.kind}: ${e.data.question}`);
    else if (e.kind === "settings.open") get(e.turn).cards.push(`Einstellungen${e.data.section ? ` (${e.data.section})` : ""}`);
    else if (e.kind === "settings.patch") get(e.turn).cards.push(`↳ ${JSON.stringify(e.data.applied)}`);
    else if (e.kind === "turn.end") get(e.turn).reply = { text: e.data.reply, outcome: e.data.outcome, latencyMs: e.data.latencyMs, error: e.data.error, ts: e.ts };
  }
  return [...turns.values()].sort((x, y) => x.turn - y.turn);
}

function Conversation({ turns }: { turns: ConvoTurn[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [turns.length, turns[turns.length - 1]?.reply?.text]);
  if (turns.length === 0) return <span className="text-md text-mute">noch keine Unterhaltung</span>;
  return (
    <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto pr-1">
      {turns.map((t) => (
        <div key={t.turn} className="flex flex-col gap-1.5">
          {t.user && (
            <div className="flex flex-col gap-0.5">
              <span className="text-2xs uppercase tracking-caps text-ok">Gast · {t.user.modality} · {clock(t.user.ts)}</span>
              <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-well px-3 py-2 text-md">{t.user.text}</div>
            </div>
          )}
          {(t.tools.length > 0 || t.cards.length > 0) && (
            <div className="flex flex-wrap gap-1.5 pl-3">
              {t.tools.map((a, j) => (
                <CodeChip key={j} tone={a.ok ? "default" : "error"} title={JSON.stringify(a.input)}>
                  ⚙ {a.tool}{Object.keys(a.input).length ? ` ${JSON.stringify(a.input)}` : ""} · {a.durationMs} ms
                </CodeChip>
              ))}
              {t.cards.map((cd, j) => <CodeChip key={`c${j}`}>▭ {cd}</CodeChip>)}
            </div>
          )}
          {t.reply && (
            <div className="flex flex-col gap-0.5 items-end">
              <span className="text-2xs uppercase tracking-caps text-mute">CoSiMo · {(t.reply.latencyMs / 1000).toFixed(1)} s · {t.reply.outcome}</span>
              <div className={cn("max-w-[92%] whitespace-pre-wrap rounded-lg rounded-tr-none border border-line px-3 py-2 text-md", t.reply.error && "border-accent")}>
                {t.reply.text || <i className="text-mute">(leer)</i>}
                {t.reply.error && <div className="mt-1 text-sm text-accent">✖ {t.reply.error}</div>}
              </div>
            </div>
          )}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function SeatCard({ seat, turns, onReset }: { seat: SeatSummary; turns: ConvoTurn[]; onReset: () => void }) {
  const a = seat.accommodations;
  return (
    <Card active={seat.phase !== "idle"} className="gap-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-lg font-semibold">
          <Emotion emotion={seat.emotion} /> <code className="text-sm opacity-70">{seat.deviceId}</code>
        </span>
        <span className="text-sm opacity-70">
          {seat.showcase ? "Schaustellung" : seat.phase !== "idle" ? `● ${seat.phase}` : "idle"}
          {seat.consent ? " · Aufzeichnung" : " · keine Aufzeichnung"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(280px,2fr)_3fr]">
        {/* ── left: the seat's configuration ── */}
        <div className="flex min-w-0 flex-col gap-3">
          <KeyValue
            keyWidth="w-[104px]"
            rows={[
              ["Persona", `${seat.personaLabel} (${seat.persona})`],
              ["Sprache", a.language],
              ["Farbe", a.theme],
              ["Schrift", a.textSize.toUpperCase()],
              ["Eingabe", a.input],
              ["Text", a.showText ? "sichtbar" : "aus"],
              ["Audio", a.audioOutput ? `an · ${Math.round((a.volume ?? 1) * 100)} %` : "aus"],
              ["Stimme", `${a.voice || (a.voiceGender === "male" ? "männlich" : "weiblich")} · ${a.voiceTone ?? "neutral"} · ${(a.speechRate ?? 1).toLocaleString("de-DE")}×`],
              ["Bewegung", a.reduceMotion ? "ruhig" : "normal"],
              ["Erinnert", seat.memories.length ? seat.memories.join(" · ") : "—"],
            ]}
          />
          <div className="mt-auto">
            <Button
              size="sm"
              onClick={() => { if (window.confirm(`Session an ${seat.deviceId} beenden? Der Sitz startet eine neue Session; gespeicherte Sessions bleiben.`)) onReset(); }}
            >
              <RotateCcw size={14} /> Zurücksetzen
            </Button>
          </div>
        </div>

        {/* ── right: the whole conversation ── */}
        <div className="flex min-w-0 flex-col gap-2 md:border-l md:border-line-soft md:pl-6">
          <Eyebrow>Unterhaltung{turns.length ? ` · ${turns.length} Turns` : ""}</Eyebrow>
          <Conversation turns={turns} />
        </div>
      </div>
    </Card>
  );
}

function SessionsTab({ c, onShowLogs }: { c: CosimoState; onShowLogs: (deviceId: string) => void }) {
  const activeSeats = c.seats.filter((s) => s.active);
  const idleSeats = c.seats.filter((s) => !s.active);
  return (
    <div className="flex flex-col gap-4">
      <Eyebrow>
        {activeSeats.length} aktiv{idleSeats.length ? ` · ${idleSeats.length} frei` : ""}
        {c.seats.length === 0 ? " · keine iPads verbunden" : ""}
      </Eyebrow>
      <Card>
        <Eyebrow>Betrieb</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => c.recover()}>
            <LifeBuoy size={15} /> Hängende Unterhaltung lösen
          </Button>
          <Button
            title="Alle Sitze auf Anfang (aufgezeichnete Sessions bleiben im CMS)"
            onClick={() => {
              // The morning reset: every seat back to the start and
              // the default profile. Recorded sessions in the CMS stay.
              if (window.confirm("Alle Sitze zurücksetzen? Laufende Unterhaltungen enden; gespeicherte Sessions bleiben erhalten.")) {
                c.resetSession("*");
              }
            }}
          >
            <RotateCw size={15} /> Alle Sitze zurücksetzen
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-base">
            <input
              type="checkbox"
              className="accent-ink focus-ring"
              checked={Boolean(c.status?.offlineCanned)}
              onChange={(e) => c.toggleOffline(e.target.checked)}
            />
            Demo- / Offline-Modus
          </label>
          <span className="flex items-center gap-2 text-md">
            <label htmlFor="persona-all" className="text-mute">Alle Sitze:</label>
            <Select
              id="persona-all"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) c.setPersona(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>Persona wählen…</option>
              {personaOptions(c.personas).map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </Select>
          </span>
        </div>
      </Card>
      {activeSeats.length > 0 && (
        <div className="flex flex-col gap-4">
          {activeSeats.map((seat) => (
            <SeatCard
              key={seat.deviceId}
              seat={seat}
              turns={conversationOf(c.logs, seat.deviceId)}
              onReset={() => c.resetSession(seat.deviceId)}
            />
          ))}
        </div>
      )}
      {idleSeats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {idleSeats.map((seat) => (
            <Chip key={seat.deviceId} size="md" muted>
              <Emotion emotion={seat.emotion} /> <code>{seat.deviceId}</code> · wartet
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Shell — header with the view switcher
 * ──────────────────────────────────────────────────────────────── */

type Tab = "uebersicht" | "licht" | "sessions" | "logs";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "uebersicht", label: "Übersicht", icon: LayoutDashboard },
  { id: "licht", label: "Licht", icon: Lightbulb },
  { id: "sessions", label: "Sessions", icon: Armchair },
  { id: "logs", label: "Logs", icon: ScrollText },
];

/**
 * The view switcher: a hamburger on the header's right, nothing else. Open,
 * a fit-to-content panel slides out from beneath the header — it animates
 * inside a clip box that starts at the header's bottom edge, so the part
 * still "under" the header is simply not painted. One row per view with
 * icon, label and count badge. Esc, a click outside and a choice close it.
 */
function TabMenu({ tab, onSwitch, badge }: { tab: Tab; onSwitch: (t: Tab) => void; badge: (t: Tab) => React.ReactNode }) {
  // "closing" keeps the panel mounted while it slides back up; the
  // animationend of that pass unmounts it.
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const open = phase === "open";
  const close = () => setPhase((p) => (p === "open" ? "closing" : p));
  const toggle = () => setPhase((p) => (p === "open" ? "closing" : "open"));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="contents">
      <Button
        variant="ghost"
        size="sm"
        icon
        className="text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? "Menü schließen" : "Menü öffnen"}
        onClick={toggle}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </Button>
      {phase !== "closed" && (
        /* The clip box: sits flush under the header's bottom edge; anything
           above its top is hidden, so the panel sliding down from -100%
           genuinely emerges from beneath the header. The padding leaves
           room for the panel's shadow on the sides and below. */
        <div className="absolute right-6 top-full z-menu overflow-hidden pb-6 pl-6">
          <nav
            role="menu"
            aria-label="Ansichten"
            onAnimationEnd={() => phase === "closing" && setPhase("closed")}
            className={cn(
              "w-max min-w-[220px] rounded-b-xl border border-t-0 border-line bg-white px-4 py-1 shadow-float motion-reduce:animate-none",
              phase === "closing" ? "animate-[menu-up_160ms_ease-in_forwards]" : "animate-[menu-down_200ms_ease-out]",
            )}
          >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  onSwitch(t.id);
                  close();
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 border-b border-line-soft py-3 text-left text-base last:border-b-0",
                  "hover:text-ink",
                  active ? "font-semibold text-ink" : "text-mute",
                )}
              >
                <Icon size={18} className={active ? "text-accent" : "text-mute"} />
                <span className="flex-1 pr-6">{t.label}</span>
                {badge(t.id)}
              </button>
            );
          })}
          </nav>
        </div>
      )}
    </div>
  );
}

function tabFromHash(): Tab {
  const hash = window.location.hash.replace("#", "");
  if (hash === "log" || hash === "logs") return "logs";
  return (TABS.some((t) => t.id === hash) ? hash : "uebersicht") as Tab; // fahrzeug/diagramm (removed) → Übersicht
}

export default function HostConsole({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const c = useCosimoSocket(REALTIME_URL, "host", "console", token);
  useEffect(() => {
    if (c.unauthorized) onUnauthorized();
  }, [c.unauthorized]);
  const st = c.status;
  // The tab survives a reload — during the show that is the one you left open.
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [logSeatFilter, setLogSeatFilter] = useState<{ seat: string; n: number } | null>(null);
  const switchTab = (t: Tab) => {
    setTab(t);
    window.location.hash = t;
  };
  /** Jump to the Logs view pre-filtered to one device (Übersicht rows, Session cards). */
  const showLogsFor = (deviceId: string) => {
    setLogSeatFilter((f) => ({ seat: deviceId, n: (f?.n ?? 0) + 1 }));
    switchTab("logs");
  };
  const errors = c.logs.filter((e) => e.level === "error").length;
  const activeSeats = c.seats.filter((s) => s.active).length;
  // No fault dot on the menu: the Übersicht cards carry the state.
  const badge = (t: Tab): React.ReactNode => {
    if (t === "sessions" && activeSeats > 0) return <span className="text-mute">{activeSeats}</span>;
    if (t === "logs" && errors > 0) return <span className="text-accent">{errors}<span className="sr-only"> Fehler</span></span>;
    return null;
  };

  return (
    <main className="min-h-screen bg-bg text-ink">
      {/* ── the header: wordmark centred, the hamburger on the right; the empty
             left zone is its counterweight. `relative` anchors the menu's clip box. ── */}
      <header className="relative sticky top-0 z-header flex items-center gap-4 border-b border-line bg-white px-6 py-2.5 shadow-card">
        <div className="flex-1" />
        <h1 className="m-0 text-2xl font-semibold">
          <a href="#uebersicht" aria-label="CoSiMo Konsole — zur Übersicht" onClick={(e) => { e.preventDefault(); switchTab("uebersicht"); }} className="inline-flex text-ink no-underline">
            <Brand />
          </a>
        </h1>
        <div className="flex flex-1 justify-end">
          <TabMenu tab={tab} onSwitch={switchTab} badge={badge} />
        </div>
      </header>

      <div className="p-6">
        {tab === "uebersicht" && <OverviewTab c={c} st={st} onShowLogs={showLogsFor} onShowSystemLogs={() => { setLogSeatFilter((f) => ({ seat: SYSTEM_SEAT, n: (f?.n ?? 0) + 1 })); switchTab("logs"); }} onOpenLight={() => switchTab("licht")} />}
        {tab === "licht" && <LightPage c={c} cfg={c.hostConfig} lightOk={st?.light} riderSection={<RiderLightRows c={c} />} onClearLogs={c.clearLogs} onReplayLogs={() => c.replayLogs()} />}
        {tab === "sessions" && <SessionsTab c={c} onShowLogs={showLogsFor} />}
        {tab === "logs" && <LogView logs={c.logs} onClear={c.clearLogs} onReplay={() => c.replayLogs()} seatFilter={logSeatFilter} />}
      </div>

      {(c.reloadRequired || c.evicted) && (
        <div role="alertdialog" aria-modal="true" aria-label={c.evicted ? "Konsole ersetzt" : "Neu laden"} className="fixed inset-0 z-drawer flex items-center justify-center bg-ink/20 p-6">
          <Card className="w-[min(420px,100%)] items-start gap-4">
            <span className="text-2xl font-black">{c.evicted ? "Konsole ersetzt" : "Konsole neu laden"}</span>
            <p className="m-0 text-md text-mute">
              {c.evicted
                ? `Es sind höchstens ${c.evicted.max} Konsolen gleichzeitig erlaubt — eine neue hat diese (die älteste) abgelöst. Neu laden holt sie zurück und löst dafür die dann älteste ab.`
                : "Eine andere Konsole hat alles zurückgesetzt. Diese Seite zeigt möglicherweise alten Stand — bitte neu laden."}
            </p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              <RotateCw size={15} /> Neu laden
            </Button>
          </Card>
        </div>
      )}

      {c.inspection && (
        <InspectorDrawer
          inspection={c.inspection}
          onRefresh={() => c.inspectSeat(c.inspection!.deviceId)}
          onClose={() => c.clearInspection()}
        />
      )}
    </main>
  );
}
