import { useEffect, useMemo, useRef, useState } from "react";
import { LOG_KINDS, type LogEvent, type LogKind, type LogLevel } from "@cosimo/shared";

/**
 * The Log view — the structured debug stream from the realtime service, live.
 * Every turn of every seat, with its tool calls, cabin actuations, timings
 * and errors. Events group by (seat, turn) so one conversation step reads as
 * a unit; everything is filterable and exportable as NDJSON.
 *
 * Read-only by design: this is a debugging surface, not a control surface —
 * controls live in the operator view.
 */

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "#8a8a8a",
  info: "#181817",
  warn: "#b45309",
  error: "#e40041",
};

const KIND_ICON: Record<LogKind, string> = {
  "seat.connect": "🔌",
  "seat.disconnect": "⏏",
  consent: "✅",
  "nfc.scan": "💳",
  "persona.switch": "👤",
  "turn.start": "🗣",
  "stt.result": "🎙",
  "llm.step": "🧠",
  "tool.call": "⚙",
  "cabin.actuate": "💡",
  "cabin.result": "↩",
  "tts.done": "🔊",
  "turn.end": "🏁",
  "host.action": "🕹",
  "fault.start": "⚠️",
  "fault.end": "✔",
  "service.status": "📡",
};

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
      return `${e.data.chars} chars → ${Math.round(e.data.bytes / 1024)} kB in ${e.data.durationMs} ms`;
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
  }
}

function time(ts: string): string {
  const d = new Date(ts);
  return `${d.toLocaleTimeString("de-DE")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const mono = '"Source Code Pro", ui-monospace, "SF Mono", Menlo, monospace';
/** One template for the header and every row — the columns can never drift. */
const GRID = "92px 110px 96px 60px 150px 1fr";
const input: React.CSSProperties = {
  background: "#f6f6f6",
  color: "#181817",
  border: "1px solid #e4e4e4",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
};
const btn: React.CSSProperties = { ...input, cursor: "pointer" };

export default function LogView({
  logs,
  onClear,
  onReplay,
}: {
  logs: LogEvent[];
  onClear: () => void;
  onReplay: () => void;
}) {
  const [seat, setSeat] = useState("");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "calc(100vh - 120px)", minHeight: 400 }}>
      {/* ── toolbar ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select style={input} value={seat} onChange={(e) => { setSeat(e.target.value); setSession(""); }}>
          <option value="">all seats</option>
          {seats.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={input} value={session} onChange={(e) => setSession(e.target.value)}>
          <option value="">all sessions</option>
          {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={input} value={minLevel} onChange={(e) => setMinLevel(e.target.value as LogLevel)}>
          {LEVELS.map((l) => <option key={l} value={l}>≥ {l}</option>)}
        </select>
        <input
          style={{ ...input, flex: 1, minWidth: 160 }}
          placeholder="search text / tool / json…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button style={{ ...btn, borderColor: paused ? "#b45309" : "#e4e4e4" }} onClick={() => setPaused((p) => !p)}>
          {paused ? "▶ resume" : "⏸ pause"}
        </button>
        <button style={btn} onClick={onReplay} title="re-request the hub's buffer">↻ replay</button>
        <button style={btn} onClick={exportNdjson} disabled={!filtered.length}>⬇ export {filtered.length}</button>
        <button style={btn} onClick={onClear}>clear</button>
      </div>

      {/* ── kind chips ──────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {LOG_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => toggleKind(k)}
            style={{
              ...btn,
              padding: "2px 8px",
              fontSize: 11,
              opacity: kinds.has(k) ? 1 : 0.35,
              borderColor: kinds.has(k) ? "#c9c9c9" : "#e4e4e4",
            }}
          >
            {KIND_ICON[k]} {k}
          </button>
        ))}
        <button style={{ ...btn, padding: "2px 8px", fontSize: 11 }} onClick={() => setKinds(new Set(LOG_KINDS))}>all</button>
        <button style={{ ...btn, padding: "2px 8px", fontSize: 11 }} onClick={() => setKinds(new Set(["turn.start", "tool.call", "cabin.actuate", "cabin.result", "turn.end"]))}>
          turns only
        </button>
      </div>

      {/* ── the tail ────────────────────────────────────────────── */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#f6f6f6",
          border: "1px solid #e4e4e4",
          borderRadius: 10,
          fontFamily: mono,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            display: "grid",
            gridTemplateColumns: GRID,
            gap: 10,
            padding: "6px 10px 6px 13px",
            background: "#fafafa",
            borderBottom: "1px solid #e4e4e4",
            fontSize: 10.5,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#6b6b6b",
          }}
        >
          <span>Time</span>
          <span>Seat</span>
          <span>Session</span>
          <span>Turn</span>
          <span>Event</span>
          <span>Details</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 16, opacity: 0.5 }}>
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
              onClick={() => setOpen(isOpen ? null : e.seq)}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 10,
                padding: "3px 10px",
                background: key && band ? "#f7f7f7" : "transparent",
                borderLeft: `3px solid ${e.level === "error" ? "#e40041" : e.level === "warn" ? "#b45309" : "transparent"}`,
                color: LEVEL_COLOR[e.level],
                cursor: "pointer",
              }}
            >
              <span style={{ opacity: 0.6 }}>{time(e.ts)}</span>
              <span style={{ opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.deviceId}>
                {e.deviceId ?? "—"}
              </span>
              <span style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.sessionId}>
                {e.sessionId ?? ""}
              </span>
              <span style={{ opacity: 0.6 }}>{e.turn != null ? `#${e.turn}` : ""}</span>
              <span>{KIND_ICON[e.kind]} {e.kind}</span>
              <span style={{ whiteSpace: isOpen ? "pre-wrap" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", wordBreak: "break-word" }}>
                {isOpen ? JSON.stringify({ ...e }, null, 2) : summarize(e)}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, opacity: 0.5 }}>
        {filtered.length} of {logs.length} events{paused ? " · paused (new events are buffered)" : ""} · click a row for the raw event
      </div>
    </div>
  );
}
