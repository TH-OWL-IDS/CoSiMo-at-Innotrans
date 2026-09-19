import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  CircleCheck,
  CircleCheckBig,
  CornerDownLeft,
  Download,
  FlagTriangleRight,
  IdCard,
  Joystick,
  Lightbulb,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Plug,
  SlidersHorizontal,
  RadioTower,
  Activity,
  RotateCw,
  Trash2,
  TriangleAlert,
  Unplug,
  UserRound,
  Volume2,
  Wrench,
  type LucideIcon,
  ListTodo,
  MousePointerClick,
  Power,
  Settings2,
  UserPlus,
  UserCheck,
} from "lucide-react";
import { LOG_KINDS, type LogEvent, type LogKind, type LogLevel } from "@cosimo/shared";
import { Button, Input, Select, Tip, cn } from "@cosimo/ui";

/**
 * The Log view — the structured debug stream from the realtime service, live.
 * Every turn of every seat, with its tool calls, cabin actuations, timings
 * and errors — newest on top. A hairline separates one (seat, turn) from the
 * next so a conversation step reads as a block; everything is filterable
 * and exportable as NDJSON.
 *
 * Read-only by design: this is a debugging surface, not a control surface —
 * controls live in the operator view.
 */

const KIND_ICON: Record<LogKind, LucideIcon> = {
  "seat.connect": Plug,
  "seat.disconnect": Unplug,
  consent: CircleCheck,
  "nfc.scan": IdCard,
  "persona.switch": UserRound,
  "turn.start": MessageSquare,
  "stt.result": Mic,
  "llm.step": Brain,
  "tool.call": Wrench,
  "cabin.actuate": Lightbulb,
  "cabin.result": CornerDownLeft,
  "service.boot": Power,
  "config.loaded": Settings2,
  "service.restart": RotateCw,
  "session.start": UserPlus,
  "session.checkin": UserCheck,
  "card.show": ListTodo,
  "settings.open": SlidersHorizontal,
  "settings.patch": MousePointerClick,
  "tts.done": Volume2,
  "turn.end": FlagTriangleRight,
  "host.action": Joystick,
  "fault.start": TriangleAlert,
  "fault.end": CircleCheckBig,
  "service.status": RadioTower,
  "device.health": Activity,
};

/** The kind, as icon + name — one visual voice for chips and rows. */
/** Pseudo-seat for the filter: events that belong to no seat and no session. */
export const SYSTEM_SEAT = "__system";

export function Kind({ k, size = 13 }: { k: LogKind; size?: number }) {
  const Icon = KIND_ICON[k];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={size} className="shrink-0" />
      {k}
    </span>
  );
}

/** One-line human summary per event kind; the raw JSON is a click away. */
export function summarize(e: LogEvent): string {
  switch (e.kind) {
    case "seat.connect":
      return `${e.data.role} connected`;
    case "seat.disconnect":
      return `${e.data.role} disconnected`;
    case "consent":
      return e.data.consent ? "consent given" : "consent declined";
    case "nfc.scan":
      return `card ${e.data.tagId} → ${e.data.persona ?? "unknown"}`;
    case "persona.switch":
      return `profile → ${e.data.persona} (${e.data.by})`;
    case "turn.start":
      return `${e.data.modality} · ${e.data.lang} · ${e.data.llm ? `${e.data.llm.provider}/${e.data.llm.model}` : "canned"} · “${e.data.text}”`;
    case "service.boot":
      return `Hub gestartet · :${e.data.port}${e.data.docker ? " · Docker" : ""} · ${e.data.llm.provider}/${e.data.llm.model} · node ${e.data.node}`;
    case "config.loaded":
      return `Konfig ${e.data.source === "cms" ? "aus dem CMS" : "env-Defaults"} · ${e.data.llm} · Fallback ${e.data.fallback ?? "keiner"} · ${e.data.voices} Stimmen · LPU-2 ${e.data.lpu2Mapped} gemappt${e.data.changed.length ? ` · geändert: ${e.data.changed.join(", ")}` : ""}`;
    case "service.restart":
      return `Container „${e.data.id}“ ${e.data.ok ? "neu gestartet" : "Neustart fehlgeschlagen"} (${e.data.durationMs} ms)${e.data.error ? ` · ${e.data.error}` : ""}`;
    case "session.checkin":
      return `eingecheckt · ${e.data.by === "nfc" ? "Karte" : e.data.by === "guest" ? "ohne Anmeldung" : "erste Eingabe"}`;
    case "session.start":
      return `neue Session · ${e.data.persona} (${e.data.by})${e.data.consent ? " · Aufzeichnung" : " · keine Aufzeichnung"}${e.data.stored ? " (Profil)" : ""}${e.data.previousSessionId ? ` · vorher ${e.data.previousSessionId}` : ""}`;
    case "card.show":
      return `${e.data.kind} · “${e.data.question}”${e.data.options.length ? ` (${e.data.options.join(" | ")})` : ""}`;
    case "settings.open":
      return `Einstellungen geöffnet${e.data.section ? ` · ${e.data.section}` : ""}`;
    case "settings.patch":
      return `${JSON.stringify(e.data.applied)}${e.data.speak ? " · gesprochen" : ""}`;
    case "stt.result":
      return `${e.data.chars} chars in ${e.data.durationMs} ms (${Math.round(e.data.bytes / 1024)} kB ${e.data.mime})`;
    case "llm.step":
      return `step ${e.data.step}: ${e.data.chars} chars, ${e.data.toolCalls.length ? `tools ${e.data.toolCalls.join(", ")}` : "no tools"} · ${e.data.durationMs} ms`;
    case "tool.call":
      return `${e.data.tool}(${JSON.stringify(e.data.input)}) → ${e.data.result} · ${e.data.durationMs} ms`;
    case "cabin.actuate":
      return `${e.data.scope === "cabin" ? "Kabine · " : ""}${e.data.control} ${JSON.stringify(e.data.change)} → ${e.data.urls.join(" , ")}${e.data.actuator ? ` · via ${e.data.actuator}` : ""}`;
    case "cabin.result":
      return `${e.data.scope === "cabin" ? "Kabine · " : ""}${e.data.control} ${e.data.ok ? "ok" : `FAILED${e.data.error ? ` — ${e.data.error}` : ""}`}${e.data.requestedBy ? ` · für ${e.data.requestedBy}` : ""}`;
    case "tts.done":
      return `${e.data.chars} chars → ${Math.round(e.data.bytes / 1024)} kB${e.data.chunks ? ` · ${e.data.chunks} Clip${e.data.chunks > 1 ? "s" : ""}` : ""}${e.data.firstChunkMs != null ? ` · erstes Audio nach ${e.data.firstChunkMs} ms` : ""} (${e.data.durationMs} ms)`;
    case "turn.end": {
      const t = e.data.timings;
      const parts = [t.sttMs != null && `stt ${t.sttMs}`, t.llmMs != null && `llm ${t.llmMs}`, t.ttsMs != null && `tts ${t.ttsMs}`].filter(Boolean);
      return `${e.data.outcome} · ${e.data.latencyMs} ms${parts.length ? ` (${parts.join(", ")})` : ""} · ${e.data.tools} tool${e.data.tools === 1 ? "" : "s"} · ${e.data.emotion}${e.data.error ? ` · ${e.data.error}` : ""} · “${e.data.reply}”`;
    }
    case "host.action":
      return `${e.data.action} ${JSON.stringify(e.data.args)}`;
    case "fault.start":
      return `${e.data.fault} for ${e.data.durationSec}s (${e.data.by})`;
    case "fault.end":
      return `${e.data.fault} cleared (${e.data.by})`;
    case "service.status":
      return Object.entries(e.data).map(([k, v]) => `${k}:${v ? "up" : "down"}`).join(" ");
    case "device.health":
      return `${e.data.health}${e.data.rttMs != null ? ` · ${e.data.rttMs} ms` : ""} · ${e.data.transport}`;
  }
}

function time(ts: string): string {
  const d = new Date(ts);
  return `${d.toLocaleTimeString("de-DE")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const TURN_KINDS: LogKind[] = ["turn.start", "tool.call", "cabin.actuate", "cabin.result", "turn.end"];

/** One template for the header and every row — set once as a CSS variable
 *  on the tail container, so the columns can never drift. */
const GRID = "84px 124px 148px 1fr";

/** Icon-only toolbar action with a tooltip. */
function Action({ tip, ...props }: React.ComponentProps<typeof Button> & { tip: string }) {
  return (
    <Tip tip={tip}>
      <Button size="sm" variant="ghost" icon aria-label={tip} {...props} />
    </Tip>
  );
}
const ROW = "grid grid-cols-[var(--log-grid)] gap-3";

export default function LogView({
  logs,
  onClear,
  onReplay,
  seatFilter,
}: {
  logs: LogEvent[];
  onClear: () => void;
  onReplay: () => void;
  /** External pre-filter (e.g. the Diagramm's "Log dieser Session" link);
   *  `n` bumps so re-clicking the same seat re-applies it. */
  seatFilter?: { seat: string; n: number } | null;
}) {
  const [seat, setSeat] = useState("");
  useEffect(() => {
    if (seatFilter) {
      setSeat(seatFilter.seat);
      setSession("");
    }
  }, [seatFilter]);
  const [session, setSession] = useState("");
  const [kinds, setKinds] = useState<Set<LogKind>>(new Set(LOG_KINDS));
  const [showKinds, setShowKinds] = useState(false);
  const [minLevel, setMinLevel] = useState<LogLevel>("debug");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Frozen snapshot while paused, so the list stops moving under the cursor. */
  const frozen = useRef<LogEvent[]>([]);
  if (!paused) frozen.current = logs;
  const source = paused ? frozen.current : logs;

  const seats = useMemo(() => [...new Set(source.map((e) => e.deviceId).filter(Boolean))] as string[], [source]);
  const sessions = useMemo(
    () => [...new Set(source.filter((e) => !seat || e.deviceId === seat).map((e) => e.sessionId).filter(Boolean))] as string[],
    [source, seat],
  );

  // Newest first: the hub's buffer is chronological, the view reads top-down.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: LogEvent[] = [];
    for (let i = source.length - 1; i >= 0; i--) {
      const e = source[i]!;
      if (
        (!seat || (seat === SYSTEM_SEAT ? !e.deviceId && !e.sessionId : e.deviceId === seat)) &&
        (!session || e.sessionId === session) &&
        kinds.has(e.kind) &&
        LEVEL_RANK[e.level] >= LEVEL_RANK[minLevel] &&
        (!q || summarize(e).toLowerCase().includes(q) || JSON.stringify(e.data).toLowerCase().includes(q))
      ) out.push(e);
    }
    return out;
  }, [source, seat, session, kinds, minLevel, query]);

  // Keep the newest in view unless paused.
  useEffect(() => {
    if (paused) return;
    const el = listRef.current;
    if (el) el.scrollTop = 0;
  }, [filtered.length, paused]);

  const exportNdjson = () => {
    // chronological on disk, like the hub's buffer
    const blob = new Blob([[...filtered].reverse().map((e) => JSON.stringify(e)).join("\n") + "\n"], { type: "application/x-ndjson" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cosimo-log-${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggleKind = (k: LogKind) =>
    setKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const kindsFiltered = kinds.size !== LOG_KINDS.length;

  // A hairline where one (seat, turn) ends and the next begins.
  const turnKey = (e: LogEvent) => (e.turn != null ? `${e.deviceId}#${e.turn}` : "");
  let lastKey: string | null = null;

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[400px] flex-col gap-2">
      {/* ── toolbar: filters left, actions right, one line ───────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Select size="sm" tone="well" aria-label="Sitz" value={seat} onChange={(e) => { setSeat(e.target.value); setSession(""); }}>
          <option value="">alle Sitze</option>
          <option value={SYSTEM_SEAT}>System</option>
          {seats.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select size="sm" tone="well" aria-label="Session" value={session} onChange={(e) => setSession(e.target.value)}>
          <option value="">alle Sessions</option>
          {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select size="sm" tone="well" aria-label="Mindest-Level" value={minLevel} onChange={(e) => setMinLevel(e.target.value as LogLevel)}>
          {LEVELS.map((l) => <option key={l} value={l}>≥ {l}</option>)}
        </Select>
        <Input
          size="sm"
          tone="well"
          aria-label="Suche"
          className="min-w-40 flex-1"
          placeholder="Suche …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Tip tip={`Ereignisarten · ${kinds.size}/${LOG_KINDS.length}`}>
          <Button size="sm" variant="ghost" aria-pressed={showKinds} aria-label="Ereignisarten" onClick={() => setShowKinds((v) => !v)} className={cn("gap-1.5", (showKinds || kindsFiltered) && "text-ink")}>
            <SlidersHorizontal size={14} />
            {kindsFiltered && <span className="text-xs tabular-nums">{kinds.size}</span>}
          </Button>
        </Tip>
        <span className="mx-1 h-4 w-px bg-line-soft/20" aria-hidden />
        <Action tip={paused ? "Weiter (neue Ereignisse werden gepuffert)" : "Anhalten"} aria-pressed={paused} className={cn(paused && "text-warn")} onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </Action>
        <Action tip="Puffer des Hubs neu laden" onClick={onReplay}><RotateCw size={14} /></Action>
        <Action tip={`Export · ${filtered.length} Ereignisse als NDJSON`} onClick={exportNdjson} disabled={!filtered.length}><Download size={14} /></Action>
        <Action tip="Leeren" onClick={onClear}><Trash2 size={14} /></Action>
      </div>

      {/* ── kind toggles, on demand ──────────────────────────────── */}
      {showKinds && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b border-line-soft/15 pb-2 font-mono text-xs">
          {LOG_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kinds.has(k)}
              onClick={() => toggleKind(k)}
              className="cursor-pointer rounded-sm px-1.5 py-0.5 transition-opacity duration-150 hover:bg-well aria-[pressed=false]:opacity-35 motion-reduce:transition-none"
            >
              <Kind k={k} size={11} />
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-line-soft/20" aria-hidden />
          <button type="button" className="cursor-pointer rounded-sm px-1.5 py-0.5 text-mute hover:bg-well hover:text-ink" onClick={() => setKinds(new Set(LOG_KINDS))}>alle</button>
          <button type="button" className="cursor-pointer rounded-sm px-1.5 py-0.5 text-mute hover:bg-well hover:text-ink" onClick={() => setKinds(new Set(TURN_KINDS))}>nur Turns</button>
        </div>
      )}

      {/* ── the list, newest on top ──────────────────────────────── */}
      <div ref={listRef} className="flex-1 overflow-y-auto font-mono text-sm leading-normal" style={{ "--log-grid": GRID } as React.CSSProperties}>
        <div className={cn(ROW, "sticky top-0 z-sticky border-b border-line-soft/25 bg-bg py-1.5 text-2xs uppercase tracking-caps text-mute")}>
          <span>Zeit</span>
          <span>Sitz</span>
          <span>Ereignis</span>
          <span>Details</span>
        </div>
        {filtered.length === 0 && (
          <div className="py-6 text-mute">
            {logs.length === 0 ? "Noch keine Ereignisse — sie erscheinen, sobald Sitze verbinden und sprechen." : "Nichts passt zum aktuellen Filter."}
          </div>
        )}
        {filtered.map((e) => {
          const key = turnKey(e);
          const boundary = lastKey !== null && key !== lastKey;
          lastKey = key;
          const isOpen = open === e.seq;
          return (
            <div
              key={e.seq}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : e.seq)}
              onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), setOpen(isOpen ? null : e.seq))}
              data-level={e.level}
              className={cn(
                ROW,
                "cursor-pointer py-1 text-left focus-ring hover:bg-well",
                boundary ? "border-t border-line-soft/25" : "border-t border-line-soft/[0.06]",
                "data-[level=debug]:text-mute data-[level=warn]:text-warn data-[level=error]:text-accent",
              )}
            >
              <span className="tabular-nums text-mute">{time(e.ts)}</span>
              <Tip tip={[e.deviceId, e.sessionId && `Session ${e.sessionId}`].filter(Boolean).join("\n") || null} className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate">{e.deviceId ?? "—"}</span>
                {e.turn != null && <span className="shrink-0 text-2xs text-mute">#{e.turn}</span>}
              </Tip>
              <span className="truncate"><Kind k={e.kind} /></span>
              <span className={cn("min-w-0 break-words", isOpen ? "whitespace-pre-wrap text-ink" : "truncate")}>
                {isOpen ? JSON.stringify({ ...e }, null, 2) : summarize(e)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-2xs text-mute">
        {filtered.length} / {logs.length}{paused ? " · angehalten" : ""}
      </div>
    </div>
  );
}
