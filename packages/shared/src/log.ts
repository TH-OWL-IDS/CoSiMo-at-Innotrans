/**
 * The structured debug log — one event per meaningful step the realtime
 * service takes. This is the DEBUGGING stream (ring buffer + daily NDJSON
 * file + live push to host consoles), deliberately separate from the
 * consent-gated `sessions` research dataset: different obligations,
 * different stores. Transcripts are logged unconditionally by decision
 * (switchable with LOG_TRANSCRIPTS=false before the fair).
 *
 * The per-seat turn number is the join key: one turn, N events.
 */

import type { CabinControlId } from "./cabin.js";
import type { FaceEmotion } from "./emotion.js";
import type { FaultKind, Locale } from "./telemetry.js";
import type { PersonaKey } from "./persona.js";
import type { Modality, TurnOutcome } from "./session.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Envelope shared by every event. */
interface Base {
  /** Monotonic per process — clients use it to replay/dedupe. */
  seq: number;
  /** ISO timestamp. */
  ts: string;
  level: LogLevel;
  deviceId?: string;
  sessionId?: string;
  /** The seat's turn number, when the event belongs to a turn. */
  turn?: number;
}

export type LogEvent = Base &
  (
    | { kind: "seat.connect"; data: { role: "kiosk" | "host"; restored?: boolean } }
    | { kind: "seat.disconnect"; data: { role: "kiosk" | "host" } }
    | { kind: "consent"; data: { consent: boolean } }
    | { kind: "nfc.scan"; data: { tagId: string; persona: PersonaKey | null } }
    | { kind: "persona.switch"; data: { persona: PersonaKey; by: "nfc" | "host" | "boot" } }
    | {
        kind: "turn.start";
        data: {
          text: string;
          modality: Modality;
          lang: Locale;
          persona: PersonaKey;
          consent: boolean;
          /** Which brain answers — null when canned (offline / no provider). */
          llm: { provider: string; model: string } | null;
          historyMessages: number;
        };
      }
    | { kind: "stt.result"; data: { chars: number; durationMs: number; mime: string; bytes: number } }
    | { kind: "llm.step"; data: { step: number; chars: number; toolCalls: string[]; durationMs: number; finish?: string } }
    | {
        kind: "tool.call";
        data: {
          tool: string;
          input: Record<string, unknown>;
          /** Truncated for the event; the NDJSON line keeps the full text. */
          result: string;
          ok: boolean;
          durationMs: number;
        };
      }
    | { kind: "cabin.actuate"; data: { control: CabinControlId; urls: string[]; change: Record<string, unknown> } }
    | { kind: "cabin.result"; data: { control: CabinControlId; ok: boolean; error?: string } }
    | { kind: "card.show"; data: { kind: string; question: string; options: string[]; local: boolean; step?: string } }
    | { kind: "card.answer"; data: { kind: string; value: string; applied?: Record<string, unknown> } }
    | {
        kind: "tts.done";
        data: {
          chars: number;
          bytes: number;
          durationMs: number;
          voice?: { gender: string; tone: string; rate: number };
          /** Streaming: time from turn start to the first playable clip. */
          firstChunkMs?: number;
          chunks?: number;
        };
      }
    | {
        kind: "turn.end";
        data: {
          outcome: TurnOutcome;
          reply: string;
          emotion: FaceEmotion;
          latencyMs: number;
          timings: { sttMs?: number; llmMs?: number; ttsMs?: number };
          tools: number;
          error?: string;
        };
      }
    | { kind: "host.action"; data: { action: string; args: Record<string, unknown> } }
    | { kind: "fault.start"; data: { fault: FaultKind; durationSec: number; by: "scenario" | "host" } }
    | { kind: "fault.end"; data: { fault: FaultKind; by: "elapsed" | "host" } }
    | { kind: "service.status"; data: Record<string, boolean> }
    /** A device's link health changed (deviceId names it). */
    | { kind: "device.health"; data: { health: "ok" | "slow" | "stale" | "lost"; rttMs: number | null; transport: string } }
  );

export type LogKind = LogEvent["kind"];

export const LOG_KINDS: readonly LogKind[] = [
  "seat.connect",
  "seat.disconnect",
  "consent",
  "nfc.scan",
  "persona.switch",
  "turn.start",
  "stt.result",
  "llm.step",
  "tool.call",
  "cabin.actuate",
  "cabin.result",
  "card.show",
  "card.answer",
  "tts.done",
  "turn.end",
  "host.action",
  "fault.start",
  "fault.end",
  "service.status",
  "device.health",
] as const;
