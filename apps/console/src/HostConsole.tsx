import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Armchair, BatteryLow, BatteryMedium, Brain, Cable, Check, Clock,
  DoorClosed, DoorOpen, Ear, Flag, FlaskConical, Frown, Globe, IdCard,
  Database, LayoutDashboard, LifeBuoy, Lightbulb, MapPin, Meh, Menu, MessageCircle, Mic, Moon,
  Pause, Play, RotateCcw, RotateCw, ScrollText, Search, Smile, TramFront, TriangleAlert,
  RadioTower, TabletSmartphone, Users, Volume2, Waypoints, X, Zap, type LucideIcon,
} from "lucide-react";
import {
  CABIN_CONTROLS,
  type Accommodations,
  type ConnectedDevice,
  type ConnectionStatus,
  type DeviceHealth,
  type LogEvent,
  type MonoCabTelemetry,
  type PersonaBroadcast,
  type PersonaKey,
  type SeatInspection,
  type SeatSummary,
} from "@cosimo/shared";
import { useCosimoSocket, type CosimoState } from "@cosimo/client";
import { Banner, Brand, Button, Card, Chip, CodeChip, Dot, Eyebrow, KeyValue, Meter, SeatGlyph, Select, StatTile, Tip, cn } from "@cosimo/ui";
import { resolveServerUrl } from "./serverUrl";
import LogView from "./LogView";
import DiagramView from "./DiagramView";
import cabUrl from "./assets/monocab-base.svg";

/**
 * Die Konsole — the live operator surface, five views behind one header:
 *
 *  ÜBERSICHT  every service the demo depends on, with a detail line.
 *  FAHRZEUG   the MonoCab itself: the CI line drawing, live state around it,
 *             and the journey/fault controls.
 *  SESSIONS   the Betrieb card (recover, demo mode, all-seat persona, reset
 *             all — "seats" = every kiosk-role client, the emulator too),
 *             then one card per active seat, idle seats as chips.
 *  DIAGRAMM   the system as live, draggable bubbles (DiagramView).
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

const TOGGLE_CONTROLS = CABIN_CONTROLS.filter((c) => c.kind === "toggle");

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

/** Compact chips describing the accommodations a seat is presenting with. */
function accommodationChips(a: Accommodations): string[] {
  return [
    a.theme,
    `Text ${a.textSize.toUpperCase()}`,
    a.contrast === "high" ? "Kontrast" : null,
    a.audioOutput ? "Audio" : "🔇",
    a.showText ? "Text sichtbar" : null,
    a.reduceMotion ? "ruhig" : null,
    `Eingabe: ${a.input}`,
  ].filter((c): c is string => Boolean(c));
}

/* ────────────────────────────────────────────────────────────────
 * ÜBERSICHT — one card per dependency: status, consequence, live facts
 * ──────────────────────────────────────────────────────────────── */

type ServiceState = "ok" | "warn" | "down";
const STATE_LABEL: Record<ServiceState, string> = { ok: "läuft", warn: "eingeschränkt", down: "ausgefallen" };

const HEALTH_LABEL: Record<DeviceHealth, string> = { ok: "ok", slow: "langsam", stale: "antwortet nicht", lost: "getrennt" };
const healthState = (h: DeviceHealth): ServiceState => (h === "ok" ? "ok" : h === "lost" ? "down" : "warn");

/**
 * One connection, one line: what it is, its id, the last ping, the link
 * health, when it was last heard from. "stale" with recent activity is
 * almost always an old app build that doesn't answer sys:ping yet.
 */
function DeviceRow({ d, now }: { d: ConnectedDevice; now: number }) {
  const Icon = TabletSmartphone;
  const recentActivity = d.lastActivityAt != null && now - new Date(d.lastActivityAt).getTime() < 60_000;
  const note =
    d.health === "stale" && recentActivity ? "aktiv, aber kein Ping — alte App-Version?" :
    d.health === "lost" ? "Verbindung verloren" :
    d.transport === "polling" ? "kein WebSocket — nur Polling" : "";
  const title = [
    `Kiosk ${d.deviceId}`,
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
          {d.active && <span className="text-accent"> · Session</span>}
        </span>
      </Tip>
      <span className="shrink-0 tabular-nums text-mute">{d.rttMs != null ? `${d.rttMs} ms` : "—"}</span>
      {d.transport === "polling" && d.health !== "lost" && <Chip size="xs" className="shrink-0 text-warn">polling</Chip>}
      <span className={cn("inline-flex shrink-0 items-center gap-1.5", d.health === "ok" ? "text-ok" : d.health === "lost" ? "text-accent" : "text-warn")}>
        <Dot size="sm" state={healthState(d.health)} /> {HEALTH_LABEL[d.health]}
      </span>
    </div>
  );
}

function ServiceCard({ state, name, detail, icon: Icon, facts, children }: {
  state: ServiceState;
  name: string;
  /** One sentence: what this means for the demo right now (the title's tooltip). */
  detail: string;
  /** Extra content below the facts (e.g. the Verbindung card's device rows). */
  children?: React.ReactNode;
  icon: LucideIcon;
  /** Live facts, label → value; "—" when unknown. */
  facts: [string, React.ReactNode][];
}) {
  return (
    <Card active={state === "down"} className="gap-3">
      {/* the consequence sentence lives in the title's tooltip, not on the card */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon size={20} className="shrink-0 text-ink" />
        <Tip tip={detail} className="min-w-0 flex-1">
          <span className="block truncate text-2xl font-black">{name}</span>
        </Tip>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-sm", state === "ok" ? "text-ok" : state === "warn" ? "text-warn" : "text-accent")}>
          <Dot state={state} /> {STATE_LABEL[state]}
        </span>
      </div>
      <KeyValue rows={facts} keyWidth="w-[88px]" className="border-t border-line-soft pt-2.5" />
      {children}
    </Card>
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

function OverviewTab({ c, st }: { c: CosimoState; st: ConnectionStatus | null }) {
  // A minute tick, so "vor 40 s" stays honest without the log changing.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // The log stream carries the richer facts: which brain answers, whether the
  // fallback is standing in, how long the last turns took, what the light did.
  const logs = c.logs;
  const last = <K extends LogEvent["kind"]>(kind: K) =>
    [...logs].reverse().find((e): e is Extract<LogEvent, { kind: K }> => e.kind === kind);
  const recent = <K extends LogEvent["kind"]>(kind: K, n = 10) =>
    logs.filter((e): e is Extract<LogEvent, { kind: K }> => e.kind === kind).slice(-n);

  const lastTurnLlm = [...logs].reverse().find((e): e is Extract<LogEvent, { kind: "turn.start" }> => e.kind === "turn.start" && e.data.llm !== null);
  const llmName = lastTurnLlm?.data.llm ? `${lastTurnLlm.data.llm.provider} · ${lastTurnLlm.data.llm.model}` : "noch kein Turn";
  const lastSvc = last("service.status");
  const lastCmsSvc = [...logs].reverse().find((e): e is Extract<LogEvent, { kind: "service.status" }> => e.kind === "service.status" && "cms" in e.data);
  const cfg = c.hostConfig;
  const fallbackActive = Boolean(lastSvc && "llmFallbackActive" in lastSvc.data && lastSvc.data.llmFallbackActive);
  const turns = recent("turn.end");
  const lastTurn = turns[turns.length - 1];
  const turnsTotal = logs.filter((e) => e.kind === "turn.end").length;
  const llmMs = mean(turns.map((t) => t.data.timings.llmMs).filter((x): x is number => x != null));
  const sttMs = mean(turns.map((t) => t.data.timings.sttMs).filter((x): x is number => x != null));
  const ttsMs = mean(turns.map((t) => t.data.timings.ttsMs).filter((x): x is number => x != null));
  const lastStt = last("stt.result");
  const lastTts = last("tts.done");
  const cabinResults = logs.filter((e): e is Extract<LogEvent, { kind: "cabin.result" }> => e.kind === "cabin.result");
  const cabinOk = cabinResults.filter((e) => e.data.ok).length;
  const cabinFailed = cabinResults.length - cabinOk;
  const lastCabin = cabinResults[cabinResults.length - 1];
  const errors = logs.filter((e) => e.level === "error").length;
  const live = c.devices.filter((d) => d.health !== "lost");
  const kioskIds = live.filter((d) => d.role === "kiosk").map((d) => d.deviceId);
  // Rows are kiosks only (live first, lost last) — the list reads as the cab.
  // Consoles are a counter; the individual ones live in its tooltip.
  const kiosks = c.devices
    .filter((d) => d.role === "kiosk")
    .sort((a, b) => Number(a.health === "lost") - Number(b.health === "lost") || a.deviceId.localeCompare(b.deviceId));
  // Consoles that answered the last ping. A closed tab stays "stale" until
  // the socket's own timeout notices — that is not an active console.
  const hosts = live
    .filter((d) => d.role === "host" && (d.health === "ok" || d.health === "slow"))
    .sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  const consoleList = hosts.length
    ? hosts.map((d) => `${d.deviceId}${d.deviceId === c.deviceId ? " (diese)" : ""} · ${d.rttMs != null ? `${d.rttMs} ms` : "—"} · ${HEALTH_LABEL[d.health]}`).join("\n")
    : "keine";
  const activeSeats = c.seats.filter((s) => s.active).length;

  if (!st) {
    return (
      <div className="flex flex-col gap-6">
        <Card><span className="text-mute">warte auf Status …</span></Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ServiceCard
          state={!c.connected ? "down" : kiosks.some((d) => d.health === "lost") ? "down" : live.some((d) => d.health !== "ok") ? "warn" : "ok"}
          icon={Cable}
          name="Verbindungen"
          detail={c.connected ? "Hub erreichbar — jede Zeile ist ein Gerät; der Hub pingt alle 10 s." : "Keine Verbindung zum Hub — diese Konsole sieht nichts."}
          facts={[
            ["Konsolen", <Tip tip={consoleList}><span className="block truncate">{String(hosts.length)}</span></Tip>],
          ]}
        >
          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2.5">
            {kiosks.length === 0 && <span className="text-sm text-mute">keine Kiosks verbunden</span>}
            {kiosks.map((d) => <DeviceRow key={d.deviceId} d={d} now={now} />)}
          </div>
          <Button size="xs" variant="secondary" className="self-start" onClick={() => c.probeDevices()}>
            <RadioTower size={13} /> Jetzt prüfen
          </Button>
        </ServiceCard>
        <ServiceCard
          state={st.llm ? (fallbackActive ? "warn" : "ok") : "down"}
          icon={Brain}
          name="LLM"
          detail={
            st.llm
              ? fallbackActive
                ? "GX10 antwortet nicht — Claude übernimmt die Turns, bis die Probe wieder durchkommt."
                : "Der Agent antwortet live; Tools und Erinnerungen sind aktiv."
              : "Gehirn nicht erreichbar — Antworten kommen aus dem Skript."
          }
          facts={[
            ["Modell", llmName],
            ["Fallback", fallbackActive ? <span className="text-warn">aktiv (Claude)</span> : "bereit"],
            ["Ø Denken", `${ms(llmMs)}${turns.length ? ` (${turns.length} Turns)` : ""}`],
            ["Letzter Turn", lastTurn ? `${ago(lastTurn.ts, now)} · ${lastTurn.data.outcome}` : "—"],
          ]}
        />
        <ServiceCard
          state={st.serverStt ? "ok" : "warn"}
          icon={Mic}
          name="Hören (STT)"
          detail={st.serverStt ? "Deepgram auf dem Server — jede Aufnahme wird hochgeladen und transkribiert." : "Kein Server-STT — die iPads erkennen selbst, wo der Browser es kann."}
          facts={[
            ["Pfad", st.serverStt ? "Deepgram (Server)" : "Browser-Erkennung"],
            ["Ø Dauer", ms(sttMs)],
            ["Zuletzt", lastStt ? `${ago(lastStt.ts, now)} · ${lastStt.data.chars} Zeichen aus ${Math.round(lastStt.data.bytes / 1024)} kB` : "—"],
          ]}
        />
        <ServiceCard
          state={st.serverTts ? "ok" : "warn"}
          icon={Volume2}
          name="Sprechen (TTS)"
          detail={st.serverTts ? "ElevenLabs auf dem Server — die Stimme kommt satzweise als Audio zum Sitz." : "Browser-Synthese — die iPads sprechen mit der Systemstimme."}
          facts={[
            ["Pfad", st.serverTts ? "ElevenLabs (Server)" : "Browser-Synthese"],
            ["Ø Dauer", ms(ttsMs)],
            ["Erstes Audio", lastTts?.data.firstChunkMs != null ? `nach ${ms(lastTts.data.firstChunkMs)}${lastTts.data.chunks ? ` · ${lastTts.data.chunks} Clips` : ""}` : "—"],
            ["Zuletzt", lastTts ? `${ago(lastTts.ts, now)} · ${lastTts.data.chars} Zeichen` : "—"],
          ]}
        />
        <ServiceCard
          state={st.cms ? "ok" : "warn"}
          icon={Database}
          name="CMS"
          detail={st.cms ? "Payload erreichbar — Profile, Route und Sessions live." : "Nicht erreichbar — der Hub fährt mit der zuletzt geladenen Konfiguration weiter."}
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
          state={st.light ? "ok" : "warn"}
          icon={Lightbulb}
          name="Licht"
          detail={st.light ? "Treiber verbunden — CoSiMo schaltet die Kabine über die Sitze (Kabinen-LAN)." : "Kein Licht-Treiber — Lichtwünsche werden nur bestätigt, nicht ausgeführt."}
          facts={[
            ["Aktionen", cabinResults.length ? `${cabinOk} ok${cabinFailed ? ` · ${cabinFailed} fehlgeschlagen` : ""}` : "noch keine"],
            ["Zuletzt", lastCabin ? `${ago(lastCabin.ts, now)} · ${lastCabin.data.control} ${lastCabin.data.ok ? "ok" : "Fehler"}` : "—"],
            ["Weg", "iPad → LPU-2 (HTTP)"],
          ]}
        />
        <ServiceCard
          state={st.network ? "ok" : "down"}
          icon={Globe}
          name="Netzwerk"
          detail={st.network ? "Internet erreichbar — Cloud-Dienste (TTS, STT, Fallback) stehen bereit." : "Kein Internet — Offline-Modus, nur lokale Antworten."}
          facts={[
            ["Internet", st.network ? "ja" : <span className="text-accent">nein</span>],
            ["Sprache", st.speech ? "Sprachdienste ok" : "keine Sprachdienste"],
            ["Status", lastSvc ? `${ago(lastSvc.ts, now)} gemeldet` : "—"],
          ]}
        />
        <ServiceCard
          state={st.offlineCanned ? "warn" : "ok"}
          icon={FlaskConical}
          name="Modus"
          detail={st.offlineCanned ? "Demo-Modus: geskriptete Antworten, kein Agent — umschalten unter Sessions › Betrieb." : "Live: der Agent antwortet."}
          facts={[
            ["Modus", st.offlineCanned ? "Demo (Skript)" : "Live (Agent)"],
            ["Turns gesamt", String(turnsTotal)],
            ["Fehler", errors ? <span className="text-accent">{errors}</span> : "0"],
            ["Störung", c.telemetry?.faults?.[0] ? `${c.telemetry.faults[0].cause.de} (${c.telemetry.faults[0].remainingSec} s)` : "keine"],
          ]}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * FAHRZEUG — the MonoCab itself, state arranged around the CI drawing
 * ──────────────────────────────────────────────────────────────── */

function VehicleTab({ c, t }: { c: CosimoState; t: MonoCabTelemetry | null }) {
  if (!t) return <span className="text-mute">keine Telemetrie …</span>;
  const fault = t.faults?.[0];
  const outbound = t.position?.direction !== "return";
  const holding = t.position?.phase === "hold";
  const next = t.nextStops[0];
  const seats = Array.from({ length: t.capacity }, (_, i) => ({
    live: i < (t.seats?.liveSessions ?? 0),
    taken: i < t.occupancy,
  }));

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-5">
      {/* disruption first — it is the one thing that changes everything below */}
      {fault && (
        <Banner className="self-center">
          <TriangleAlert size={16} />
          <span>{fault.cause.de}</span>
          <span className="tabular-nums opacity-85">
            {Math.floor(fault.remainingSec / 60)}:{String(fault.remainingSec % 60).padStart(2, "0")}
          </span>
        </Banner>
      )}

      {/* the vehicle */}
      <div className="flex flex-col items-center gap-1.5">
        <div className={cn("text-4xl font-bold tabular-nums", holding ? "text-warn" : "text-ink")}>
          {Math.round(t.speedKmh)} <span className="text-lg font-medium text-mute">km/h</span>
        </div>
        <img src={cabUrl} alt="MonoCab" className="block w-[min(560px,90%)]" />
        <div className="text-base text-mute">
          {outbound ? "→" : "←"} {t.destination.de} · {t.line.de}
          {t.simPaused ? " · ⏸ pausiert" : ""}
          {holding ? " · Halt" : t.doorsOpen ? " · Türen offen" : ""}
        </div>
      </div>

      {/* the state, symmetric around it */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <StatTile icon={MapPin} label="Position" value={t.location.de} />
        <StatTile
          icon={Flag}
          label="Nächster Halt"
          value={next ? next.name.de : "—"}
          sub={next ? (next.etaMinutes === 0 ? "jetzt" : `in ${next.etaMinutes} min`) : ""}
        />
        <StatTile
          icon={Clock}
          label="Verspätung"
          value={t.delayMinutes > 0 ? `+${t.delayMinutes} min` : "pünktlich"}
          warn={t.delayMinutes > 0}
        />
        <StatTile
          icon={BatteryMedium}
          label="Akku"
          value={`${Math.round(t.batteryPct)} %`}
          warn={t.batteryPct < 20}
          sub={<Meter pct={t.batteryPct} warn={t.batteryPct < 20} className="mt-1" />}
        />
        <StatTile icon={t.doorsOpen ? DoorOpen : DoorClosed} label="Türen" value={t.doorsOpen ? "offen" : "geschlossen"} />
        <StatTile
          icon={Users}
          label="Fahrgäste"
          value={`${t.occupancy} / ${t.capacity}`}
          sub={
            <span className="mt-1 inline-flex gap-1">
              {seats.map((s, i) => (
                <SeatGlyph
                  key={i}
                  state={s.live ? "live" : s.taken ? "taken" : "free"}
                  title={s.live ? "echter Fahrgast (CoSiMo-Sitz aktiv)" : s.taken ? "simuliert" : "frei"}
                />
              ))}
            </span>
          }
        />
      </div>

      {/* controls that belong to the vehicle */}
      <Card>
        <Eyebrow>Fahrt steuern</Eyebrow>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => c.patchTelemetry({ paused: !t.simPaused })}>
            {t.simPaused ? <Play size={15} /> : <Pause size={15} />}
            {t.simPaused ? "Weiterfahren" : "Fahrt anhalten"}
          </Button>
          <Button onClick={() => c.patchTelemetry({ batteryPct: 15 })}>
            <BatteryLow size={15} /> Akku schwach
          </Button>
        </div>
        <Eyebrow className="mt-1.5">Störung auslösen</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {([["signal-hold", "Halt vor Signal"], ["door-fault", "Türstörung"], ["slow-order", "Langsamfahrt"], ["low-battery", "Akku niedrig"]] as const).map(([kind, label]) => (
            <Button key={kind} onClick={() => c.patchTelemetry({ fault: { kind } })}>
              <TriangleAlert size={15} className="text-warn" /> {label}
            </Button>
          ))}
          {(t.faults?.length ?? 0) > 0 && (
            <Button variant="secondary" onClick={() => c.patchTelemetry({ clearFaults: true })}>
              <Check size={15} className="text-ok" /> Störung beheben
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
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

function SeatCard({
  seat,
  personas,
  onPersona,
  onLight,
  onReset,
  onInspect,
}: {
  seat: SeatSummary;
  personas: PersonaBroadcast[];
  onPersona: (key: PersonaKey) => void;
  onLight: (control: (typeof TOGGLE_CONTROLS)[number]["id"], on: boolean) => void;
  onReset: () => void;
  onInspect: () => void;
}) {
  const personaId = `persona-${seat.deviceId}`;
  return (
    <Card active={seat.phase !== "idle"}>
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-lg font-semibold">
          <Emotion emotion={seat.emotion} /> <code className="text-sm opacity-70">{seat.deviceId}</code>
        </span>
        <span className="text-sm opacity-70">
          {seat.phase !== "idle" ? `● ${seat.phase}` : "idle"}
          {seat.consent ? " · ✓ consent" : " · no recording"}
        </span>
      </div>

      {/* persona — set by NFC chip or manually here */}
      <div className="flex items-center gap-2 text-md">
        <label htmlFor={personaId} className="inline-flex items-center gap-1.5 opacity-55"><IdCard size={14} /> Persona</label>
        <Select id={personaId} value={seat.persona} onChange={(e) => onPersona(e.target.value)}>
          {personaOptions(personas, seat.persona).map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </Select>
        <span className="text-sm opacity-55">{seat.personaLabel}</span>
      </div>

      {/* accommodations CoSiMo is presenting with (live, voice-mutable) */}
      <div className="flex flex-wrap gap-1.5">
        {accommodationChips(seat.accommodations).map((c) => (
          <Chip key={c} className="opacity-70">{c}</Chip>
        ))}
      </div>

      {/* what CoSiMo has remembered about this rider */}
      {seat.memories.length > 0 && (
        <div className="flex flex-col gap-0.5 text-sm opacity-85">
          <span className="opacity-55">Erinnert:</span>
          {seat.memories.map((m, i) => (
            <span key={i}>· {m}</span>
          ))}
        </div>
      )}

      {/* per-seat cabin (reading lamp etc.) */}
      <div className="flex flex-wrap gap-2">
        {TOGGLE_CONTROLS.map((def) => {
          const s = seat.controls.find((x) => x.id === def.id);
          const on = Boolean(s?.on);
          return (
            <Button
              key={def.id}
              size="sm"
              variant={on ? "on" : "default"}
              aria-pressed={on}
              onClick={() => onLight(def.id, !on)}
              title={def.real ? "real hardware" : "simulated"}
            >
              {def.label.de} {on ? "an" : "aus"}{s?.degraded ? " ⚠" : ""}
            </Button>
          );
        })}
      </div>

      {/* live conversation snippet */}
      <div className="flex min-h-10 flex-col gap-1 text-md">
        {seat.lastUser && (
          <div className="opacity-70">
            <span className="opacity-55">Gast: </span>{seat.lastUser}
          </div>
        )}
        {seat.lastReply && (
          <div className="opacity-85">
            <span className="opacity-55">CoSiMo: </span>{seat.lastReply}
          </div>
        )}
        {!seat.lastUser && !seat.lastReply && (
          <span className="opacity-40">noch keine Unterhaltung</span>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={onInspect}><Search size={15} /> Verlauf</Button>
        <Button onClick={onReset}><RotateCcw size={15} /> Sitz zurücksetzen</Button>
      </div>
    </Card>
  );
}

function SessionsTab({ c }: { c: CosimoState }) {
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
            title="Alle Sitze zurück zum Consent-Screen (aufgezeichnete Sessions bleiben im CMS)"
            onClick={() => {
              // The morning reset: every seat back to the consent screen and
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          {activeSeats.map((seat) => (
            <SeatCard
              key={seat.deviceId}
              seat={seat}
              personas={c.personas}
              onInspect={() => c.inspectSeat(seat.deviceId)}
              onPersona={(p) => c.setPersona(p, seat.deviceId)}
              onLight={(control, on) => c.overrideLight(seat.deviceId, control, on)}
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

type Tab = "uebersicht" | "fahrzeug" | "sessions" | "diagramm" | "logs";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "uebersicht", label: "Übersicht", icon: LayoutDashboard },
  { id: "fahrzeug", label: "Fahrzeug", icon: TramFront },
  { id: "sessions", label: "Sessions", icon: Armchair },
  { id: "diagramm", label: "Diagramm", icon: Waypoints },
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
        <div className="absolute right-6 top-full overflow-hidden pb-6 pl-6">
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
  return (TABS.some((t) => t.id === hash) ? hash : "uebersicht") as Tab;
}

export default function HostConsole() {
  const c = useCosimoSocket(REALTIME_URL, "host");
  const st = c.status;
  // The tab survives a reload — during the show that is the one you left open.
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [logSeatFilter, setLogSeatFilter] = useState<{ seat: string; n: number } | null>(null);
  const switchTab = (t: Tab) => {
    setTab(t);
    window.location.hash = t;
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
        <h1 className="m-0 text-2xl font-semibold" aria-label="CoSiMo Konsole">
          <Brand />
        </h1>
        <div className="flex flex-1 justify-end">
          <TabMenu tab={tab} onSwitch={switchTab} badge={badge} />
        </div>
      </header>

      <div className={tab === "diagramm" ? "p-0" : "p-6"}>
        {tab === "uebersicht" && <OverviewTab c={c} st={st} />}
        {tab === "fahrzeug" && <VehicleTab c={c} t={c.telemetry} />}
        {tab === "sessions" && <SessionsTab c={c} />}
        {tab === "diagramm" && (
          <DiagramView
            c={c}
            st={st}
            t={c.telemetry}
            onShowLogs={(deviceId) => {
              setLogSeatFilter((f) => ({ seat: deviceId, n: (f?.n ?? 0) + 1 }));
              switchTab("logs");
            }}
          />
        )}
        {tab === "logs" && <LogView logs={c.logs} onClear={c.clearLogs} onReplay={() => c.replayLogs()} seatFilter={logSeatFilter} />}
      </div>

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
