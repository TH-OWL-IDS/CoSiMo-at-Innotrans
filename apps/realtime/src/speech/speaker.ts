import type { Locale } from "@cosimo/shared";
import type { Hub } from "../hub.js";
import { logger } from "../log/logger.js";
import { takeSentences } from "./sentences.js";
import type { TtsProvider, VoiceOptions } from "./tts.js";

/**
 * Streams one turn's speech: text is pushed as the LLM generates it, each
 * completed sentence is synthesized right away (ordered, one at a time — at
 * ~150 ms per sentence ElevenLabs Flash never becomes the bottleneck) and
 * shipped to the seat as a `tts:chunk` the moment it exists. The kiosk plays
 * the chunks back-to-back, so the rider hears sentence one while sentence
 * two is still being written.
 *
 * `previous_text` carries the already-spoken sentences so prosody stays
 * continuous across clips. A barge-in (abort signal) drops everything not
 * yet shipped; the client's turn guard catches what is already in flight.
 */
export class TurnSpeaker {
  private buffer = "";
  private seq = 0;
  private chunks = 0;
  private bytes = 0;
  private chars = 0;
  private firstChunkAt: number | null = null;
  private readonly spoken: string[] = [];
  private lastVoice: VoiceOptions | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly deps: {
      tts: TtsProvider;
      hub: Hub;
      sessionId: string;
      turn: number;
      lang: Locale;
      /** Resolved PER SENTENCE at synth time — "sprich langsamer" in this
       *  very turn already applies to its own confirmation. */
      voice: () => VoiceOptions;
      /** False → the rider wants no audio (or no server TTS): everything is a no-op. */
      enabled: boolean;
      signal?: AbortSignal;
      /** Turn start, for time-to-first-audio. */
      startedAt: number;
    },
  ) {}

  /** Feed streamed text; complete sentences start synthesizing immediately. */
  push(text: string): void {
    if (!this.deps.enabled || !text) return;
    this.buffer += text;
    const { sentences, rest } = takeSentences(this.buffer);
    this.buffer = rest;
    for (const s of sentences) this.enqueue(s);
  }

  /** Drop unspoken text (a degenerate sample being retried). */
  discard(): void {
    this.buffer = "";
  }

  /**
   * Flush the remainder, wait for the queue, send the end marker. Returns the
   * timings for the turn record. Never throws.
   */
  async finish(): Promise<{ ttsMs: number | undefined; firstChunkMs?: number; chunks: number }> {
    if (!this.deps.enabled) return { ttsMs: undefined, chunks: 0 };
    const t0 = Date.now();
    const rest = this.buffer.trim();
    this.buffer = "";
    if (rest) this.enqueue(rest);
    await this.queue;
    const ttsMs = Date.now() - t0;
    const firstChunkMs = this.firstChunkAt ? this.firstChunkAt - this.deps.startedAt : undefined;
    if (this.chunks > 0 && !this.deps.signal?.aborted) {
      // end marker — lets the client settle `speaking` exactly once the last
      // clip has played, instead of guessing from a silence gap
      this.deps.hub.emitTtsChunk(this.deps.sessionId, {
        turn: this.deps.turn, seq: this.seq++, last: true, audioBase64: "", mime: "audio/mpeg",
      });
      logger.log(
        "tts.done",
        { chars: this.chars, bytes: this.bytes, durationMs: ttsMs, voice: this.lastVoice ?? this.deps.voice(), firstChunkMs, chunks: this.chunks },
        { sessionId: this.deps.sessionId, turn: this.deps.turn },
      );
    }
    return { ttsMs: this.chunks ? ttsMs : undefined, firstChunkMs, chunks: this.chunks };
  }

  private enqueue(sentence: string): void {
    const { tts, hub, sessionId, turn, lang, signal } = this.deps;
    this.queue = this.queue
      .then(async () => {
        if (signal?.aborted) return;
        const voice = this.deps.voice();
        this.lastVoice = voice;
        const audio = await tts.synthesize(sentence, lang, { ...voice, previousText: this.spoken.join(" ") || undefined });
        this.spoken.push(sentence);
        this.chars += sentence.length;
        if (!audio || signal?.aborted) return;
        this.chunks++;
        this.bytes += Math.floor((audio.audioBase64.length * 3) / 4);
        this.firstChunkAt ??= Date.now();
        hub.emitTtsChunk(sessionId, { turn, seq: this.seq++, last: false, audioBase64: audio.audioBase64, mime: audio.mime });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[cosimo-agent] tts chunk failed:", err);
      });
  }
}
