/**
 * The structured debug logger. One `log()` call does three things:
 *
 *  1. appends to a bounded in-memory ring buffer (replayed to host consoles
 *     when they connect — the live view has history from the first click);
 *  2. appends one JSON line to a daily NDJSON file (`LOG_DIR`, rotated by
 *     date, `LOG_KEEP_DAYS` retention) — the record that survives restarts;
 *  3. fans the event out to every subscribed host socket (`host:log`).
 *
 * It never throws and never blocks the live path: a failing disk degrades
 * to buffer + socket, a slow socket is Socket.IO's problem, not ours.
 *
 * The transcript switch (`LOG_TRANSCRIPTS`, default on — the user's call for
 * the dev phase) blanks visitor/CoSiMo text in both the file and the stream;
 * everything mechanical (tools, actuations, timings, errors) is always kept.
 */

import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { LogEvent, LogLevel } from "@cosimo/shared";
import { config } from "../config.js";

/** `log(kind, data, ctx)` input: everything but seq/ts/level, level optional. */
type Input<K extends LogEvent["kind"]> = Extract<LogEvent, { kind: K }>;
export type LogContext = { deviceId?: string; sessionId?: string; turn?: number; level?: LogLevel };

export type LogSink = (events: LogEvent[], replay: boolean) => void;

/** Longest `result`/`reply`/`text` kept in the *event*; the file keeps full text. */
const EVENT_TEXT_MAX = 2_000;

const DEFAULT_LEVEL: Record<LogEvent["kind"], LogLevel> = {
  "seat.connect": "info",
  "seat.disconnect": "info",
  "device.health": "info",
  consent: "info",
  "nfc.scan": "info",
  "persona.switch": "info",
  "turn.start": "info",
  "stt.result": "debug",
  "llm.step": "debug",
  "tool.call": "info",
  "service.boot": "info",
  "config.loaded": "info",
  "service.restart": "warn",
  "session.start": "info",
  "session.checkin": "info",
  "card.show": "info",
  "settings.open": "info",
  "settings.patch": "info",
  "cabin.actuate": "info",
  "cabin.result": "info",
  "tts.done": "debug",
  "turn.end": "info",
  "host.action": "info",
  "fault.start": "warn",
  "fault.end": "info",
  "service.status": "warn",
};

function truncate(s: string): string {
  return s.length > EVENT_TEXT_MAX ? `${s.slice(0, EVENT_TEXT_MAX)}… [+${s.length - EVENT_TEXT_MAX}]` : s;
}

/** Apply the transcript switch: blank the human-language fields. */
function redact(ev: LogEvent): LogEvent {
  if (config.log.transcripts) return ev;
  if (ev.kind === "turn.start") return { ...ev, data: { ...ev.data, text: "[transcripts off]" } };
  if (ev.kind === "turn.end") return { ...ev, data: { ...ev.data, reply: "[transcripts off]" } };
  return ev;
}

/** Shorten long text fields for the streamed/buffered copy. */
function compact(ev: LogEvent): LogEvent {
  if (ev.kind === "tool.call") return { ...ev, data: { ...ev.data, result: truncate(ev.data.result) } };
  if (ev.kind === "turn.end") return { ...ev, data: { ...ev.data, reply: truncate(ev.data.reply) } };
  if (ev.kind === "turn.start") return { ...ev, data: { ...ev.data, text: truncate(ev.data.text) } };
  return ev;
}

export class Logger {
  private seq = 0;
  private readonly buffer: LogEvent[] = [];
  private readonly sinks = new Set<LogSink>();
  private currentDay = "";
  private currentFile = "";
  /** Serialises appends so lines never interleave. */
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly capacity = config.log.bufferSize) {}

  /** Subscribe a host; it immediately receives the buffer as a replay. */
  subscribe(sink: LogSink, since?: number): () => void {
    this.sinks.add(sink);
    const replay = since == null ? this.buffer : this.buffer.filter((e) => e.seq > since);
    if (replay.length) sink(replay, true);
    return () => this.sinks.delete(sink);
  }

  /** Record one event. Never throws. */
  log<K extends LogEvent["kind"]>(kind: K, data: Input<K>["data"], ctx: LogContext = {}): void {
    try {
      const full = redact({
        seq: ++this.seq,
        ts: new Date().toISOString(),
        level: ctx.level ?? DEFAULT_LEVEL[kind],
        ...(ctx.deviceId ? { deviceId: ctx.deviceId } : {}),
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        ...(ctx.turn != null && ctx.turn >= 0 ? { turn: ctx.turn } : {}),
        kind,
        data,
      } as LogEvent);
      const slim = compact(full);

      this.buffer.push(slim);
      if (this.buffer.length > this.capacity) this.buffer.splice(0, this.buffer.length - this.capacity);

      for (const sink of this.sinks) {
        try {
          sink([slim], false);
        } catch {
          // a broken host socket must never take the logger down
        }
      }
      if (config.log.dir) this.write(full);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[log] failed:", err);
    }
  }

  /** Last `n` buffered events (for the health endpoint / tests). */
  recent(n = 50): LogEvent[] {
    return this.buffer.slice(-n);
  }

  private write(ev: LogEvent): void {
    const day = ev.ts.slice(0, 10);
    this.chain = this.chain
      .then(async () => {
        if (day !== this.currentDay) {
          await mkdir(config.log.dir, { recursive: true });
          this.currentDay = day;
          this.currentFile = join(config.log.dir, `cosimo-${day}.ndjson`);
          void this.prune();
        }
        await appendFile(this.currentFile, `${JSON.stringify(ev)}\n`, "utf8");
      })
      .catch((err) => {
        // Disk trouble degrades to buffer + socket — say so once per day.
        // eslint-disable-next-line no-console
        console.error("[log] write failed (continuing without file):", err);
      });
  }

  /** Delete daily files older than the retention window. */
  private async prune(): Promise<void> {
    try {
      const cutoff = Date.now() - config.log.keepDays * 86_400_000;
      for (const name of await readdir(config.log.dir)) {
        const m = /^cosimo-(\d{4}-\d{2}-\d{2})\.ndjson$/.exec(name);
        if (!m) continue;
        if (new Date(m[1]!).getTime() < cutoff) await unlink(join(config.log.dir, name));
      }
    } catch {
      // best-effort housekeeping
    }
  }
}

/** The process-wide logger — one stream, one file, one buffer. */
export const logger = new Logger();
