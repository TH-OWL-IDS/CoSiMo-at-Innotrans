import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain, CircleCheck, CircleCheckBig, CornerDownLeft, Download, FlagTriangleRight,
  IdCard, Joystick, Lightbulb, MessageSquare, Mic, Pause, Play, Plug, RadioTower,
  Activity, RotateCw, Trash2, TriangleAlert, Unplug, UserRound, Volume2, Wrench,
  type LucideIcon,
  ListTodo,
  MousePointerClick,
} from "lucide-react";
import { LOG_KINDS, type LogEvent, type LogKind, type LogLevel } from "@cosimo/shared";
import { Button, ChipButton, Input, Select, cn } from "@cosimo/ui";

/**
 * The Log view — the structured debug stream from the realtime service, live.
 * Every turn of every seat, with its tool calls, cabin actuations, timings
 * and errors. Events group by (seat, turn) so one conversation step reads as
 * a unit; everything is filterable and exportable as NDJSON.
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
  "card.show": ListTodo,
  "card.answer": MousePointerClick,
  "tts.done": Volume2,
  "turn.end": FlagTriangleRight,
  "host.action": Joystick,
  "fault.start": TriangleAlert,
  "fault.end": CircleCheckBig,
  "service.status": RadioTower,
  "device.health": Activity,
};

/** The kind, as icon + name — one visual voice for chips and rows. */
function Kind({ k, size = 13 }: { k: LogKind; size?: number }) {
  const Icon = KIND_ICON[k];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={size} className="shrink-0" />
      {k}
    </span>
  );
}

/** One-line human summary per event kind; the raw JSON is a click away. */
function summarize(e: LogEvent): string {
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
    case "card.show":
      return `${e.data.kind}${e.data.step ? ` ${e.data.step}` : ""}${e.data.local ? " · lokal" : ""} · “${e.data.question}”${e.data.options.length ? ` (${e.data.options.join(" | ")})` : ""}`;
    case "card.answer":
      return `${e.data.kind} → ${e.data.value}${e.data.applied ? ` · ${JSON.stringify(e.data.applied)}` : ""}`;
    case "stt.result":
      return `${e.data.chars} chars in ${e.data.durationMs} ms (${Math.round(e.data.bytes / 1024)} kB ${e.data.mime})`;
    case "llm.step":
      return `step ${e.data.step}: ${e.data.chars} chars, ${e.data.toolCalls.length ? `tools ${e.data.toolCalls.join(", ")}` : "no tools"} · ${e.data.durationMs} ms`;
    case "tool.call":
      return `${e.data.tool}(${JSON.stringify(e.data.input)}) → ${e.data.result} · ${e.data.durationMs} ms`;
    case "cabin.actuate":
      return `${e.data.control} ${JSON.stringify(e.data.change)} → ${e.data.urls.join(" , ")}`;
    case "cabin.result":
      return `${e.data.control} ${e.data.ok ? "ok" : `FAILED${e.data.error ? ` — ${e.data.error}` : ""}`}`;
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

/** One template for the header and every row — set once as a CSS variable
 *  on the tail container, so the columns can never drift. */
const GRID = "92px 110px 96px 60px 150px 1fr";
const ROW = "grid grid-cols-[var(--log-grid)] gap-2.5";

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
  const [minLevel, setMinLevel] = useState<LogLevel>("debug");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Frozen snapshot while paused, so the tail stops moving under the cursor. */
  const frozen = useRef<LogEvent[]>([]);
  if (!paused) frozen.current = logs;
  const source = paused ? frozen.current : logs;

  const seats = useMemo(() => [...new Set(source.map((e) => e.deviceId).filter(Boolean))] as string[], [source]);
  const sessions = useMemo(
    () => [...new Set(source.filter((e) => !seat || e.deviceId === seat).map((e) => e.sessionId).filter(Boolean))] as string[],
    [source, seat],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter(
      (e) =>
        (!seat || e.deviceId === seat) &&
        (!session || e.sessionId === session) &&
        kinds.has(e.kind) &&
        LEVEL_RANK[e.level] >= LEVEL_RANK[minLevel] &&
        (!q || summarize(e).toLowerCase().includes(q) || JSON.stringify(e.data).toLowerCase().includes(q)),
    );
  }, [source, seat, session, kinds, minLevel, query]);

  // Follow the tail unless paused.
  useEffect(() => {
    if (paused) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, paused]);

  const exportNdjson = () => {
    const blob = new Blob([filtered.map((e) => JSON.stringify(e)).join("\n") + "\n"], { type: "application/x-ndjson" });
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

  // Alternate a subtle background per (seat, turn) so a turn reads as a block.
  const turnKey = (e: LogEvent) => (e.turn != null ? `${e.deviceId}#${e.turn}` : "");
  let lastKey = "";
  let band = 0;

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[400px] flex-col gap-2.5">
      {/* ── toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select size="sm" tone="well" aria-label="Sitz" value={seat} onChange={(e) => { setSeat(e.target.value); setSession(""); }}>
          <option value="">all seats</option>
          {seats.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select size="sm" tone="well" aria-label="Session" value={session} onChange={(e) => setSession(e.target.value)}>
          <option value="">all sessions</option>
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
          placeholder="search text / tool / json…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button size="sm" variant="secondary" tone={paused ? "warn" : undefined} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? "resume" : "pause"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onReplay} title="re-request the hub's buffer">
          <RotateCw size={13} /> replay
        </Button>
        <Button size="sm" variant="secondary" onClick={exportNdjson} disabled={!filtered.length}>
          <Download size={13} /> export {filtered.length}
        </Button>
        <Button size="sm" variant="secondary" onClick={onClear}>
          <Trash2 size={13} /> clear
        </Button>
      </div>

      {/* ── kind chips ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1">
        {LOG_KINDS.map((k) => (
          <ChipButton key={k} aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>
            <Kind k={k} size={12} />
          </ChipButton>
        ))}
        <Button size="xs" variant="secondary" onClick={() => setKinds(new Set(LOG_KINDS))}>all</Button>
        <Button size="xs" variant="secondary" onClick={() => setKinds(new Set(["turn.start", "tool.call", "cabin.actuate", "cabin.result", "turn.end"]))}>
          turns only
        </Button>
      </div>

      {/* ── the tail ────────────────────────────────────────────── */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto rounded-lg border border-line bg-well font-mono text-sm leading-normal"
        style={{ "--log-grid": GRID } as React.CSSProperties}
      >
        <div className={cn(ROW, "sticky top-0 z-sticky border-b border-line bg-well-raised py-1.5 pl-[13px] pr-2.5 text-2xs uppercase tracking-caps text-mute")}>
          <span>Time</span>
          <span>Seat</span>
          <span>Session</span>
          <span>Turn</span>
          <span>Event</span>
          <span>Details</span>
        </div>
        {filtered.length === 0 && (
          <div className="p-4 opacity-55">
            {logs.length === 0 ? "No events yet — they appear as seats connect and talk." : "Nothing matches the current filter."}
          </div>
        )}
        {filtered.map((e) => {
          const key = turnKey(e);
          if (key && key !== lastKey) { band ^= 1; lastKey = key; }
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
              data-band={key && band ? "" : undefined}
              className={cn(
                ROW,
                "cursor-pointer border-l-[3px] border-transparent px-2.5 py-[3px] text-left",
                "hover:bg-white/60 focus-ring",
                "data-[band]:bg-well-raised",
                "data-[level=debug]:text-mute data-[level=warn]:border-warn data-[level=warn]:text-warn data-[level=error]:border-accent data-[level=error]:text-accent",
              )}
            >
              <span className="opacity-55">{time(e.ts)}</span>
              <span className="truncate opacity-85" title={e.deviceId}>
                {e.deviceId ?? "—"}
              </span>
              <span className="truncate opacity-70" title={e.sessionId}>
                {e.sessionId ?? ""}
              </span>
              <span className="opacity-55">{e.turn != null ? `#${e.turn}` : ""}</span>
              <span><Kind k={e.kind} /></span>
              <span className={cn("overflow-hidden break-words", isOpen ? "whitespace-pre-wrap" : "truncate")}>
                {isOpen ? JSON.stringify({ ...e }, null, 2) : summarize(e)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-xs opacity-55">
        {filtered.length} of {logs.length} events{paused ? " · paused (new events are buffered)" : ""} · click a row for the raw event
      </div>
    </div>
  );
}
