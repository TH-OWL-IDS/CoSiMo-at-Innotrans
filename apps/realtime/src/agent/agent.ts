/**
 * The CoSiMo agent loop — the brain. Runs a streaming Claude tool-use loop:
 * streams reply text to the iPads for latency masking, executes cabin/telemetry
 * tools, lets Claude colour the Face via set_emotion, and records the turn.
 *
 * Face/phase choreography (Phase 1): thinking while working → speaking while the
 * reply streams → settle on Claude's chosen expressive emotion (or neutral).
 */

import {
  type ExpressiveEmotion,
  type Locale,
  type Modality,
  type PersonaKey,
  type SeatInspection,
  type Turn,
  type TurnAction,
} from "@cosimo/shared";
import type { Hub } from "../hub.js";
import { buildSystemPrompt } from "./prompt.js";
import type { LlmHistoryMessage, LlmRouter } from "./llm.js";
import type { OperatorConfigProvider } from "./operatorConfig.js";
import { PersonaProvider } from "./personas.js";
import { SessionRecorder } from "./recorder.js";
import { TelemetrySimulation } from "./telemetry.js";
import { executeTool } from "./tools.js";
import { PayloadSink } from "./sink.js";
import { ProfileSink } from "./profileSink.js";
import { cannedReply, errorReply } from "./canned.js";
import type { TtsProvider } from "../speech/tts.js";

export interface AgentTurnInput {
  sessionId: string;
  deviceId: string;
  text: string;
  lang: Locale;
  persona: PersonaKey;
  /** How this turn was entered (text or voice). */
  modality: Modality;
  /** Whether the visitor consented to recording (GDPR). */
  consent: boolean;
}

/**
 * How many earlier messages of a seat's conversation are replayed to the model.
 * A turn is one message, so this is ~6 exchanges — enough for "say that again",
 * "and the next stop?", or a rider correcting themselves, without growing the
 * prompt (and the latency) unboundedly over a long booth session.
 */
const HISTORY_MESSAGES = 12;

export class CosimoAgent {
  private readonly llm: LlmRouter;
  private readonly operatorConfig: OperatorConfigProvider;
  private readonly hub: Hub;
  private readonly telemetry: TelemetrySimulation;
  readonly personas: PersonaProvider;
  private readonly tts: TtsProvider;
  private readonly sink = new PayloadSink();
  private readonly profiles = new ProfileSink();
  readonly recorder = new SessionRecorder();
  /** In-flight turn per seat — aborted on barge-in / a newer input. */
  private readonly activeTurns = new Map<string, AbortController>();
  /**
   * Where each seat's replayable history starts, and under which profile.
   * A card tap swaps the rider on a seat mid-session, so history is cut at the
   * switch: the new rider's prompt must never carry the previous visitor's
   * words (they are different people sharing one seat).
   */
  private readonly historyStart = new Map<string, { persona: PersonaKey; from: number }>();

  constructor(
    hub: Hub,
    personas: PersonaProvider,
    tts: TtsProvider,
    telemetry: TelemetrySimulation,
    llm: LlmRouter,
    operatorConfig: OperatorConfigProvider,
  ) {
    this.hub = hub;
    this.personas = personas;
    this.tts = tts;
    this.telemetry = telemetry;
    this.llm = llm;
    this.operatorConfig = operatorConfig;
    this.hub.setLlmConfigured(this.llm.maybeConfigured());
  }

  /**
   * Compose the host inspector's deep view of one seat: the exact system
   * prompt a turn would use right now, plus the recorded conversation.
   */
  inspect(deviceId: string, sessionId: string, persona: PersonaKey): SeatInspection {
    return {
      deviceId,
      sessionId,
      persona,
      systemPrompt: buildSystemPrompt(
        this.personas.get(persona),
        this.operatorConfig.get().agent.systemPrompt,
      ),
      turns: this.recorder.get(sessionId)?.turns ?? [],
    };
  }

  /**
   * Barge-in: abort the seat's in-flight turn (rider pressed the talk button
   * or sent new input). The aborted turn closes its own stream quietly — no
   * canned fallback, no face/phase stomping — and records as "interrupted".
   */
  interrupt(deviceId: string): void {
    const ctrl = this.activeTurns.get(deviceId);
    if (ctrl && !ctrl.signal.aborted) ctrl.abort();
  }

  /**
   * Handle one user turn end-to-end. Records the user turn, runs the agent
   * loop, streams the reply, records the CoSiMo turn. A newer input for the
   * same seat aborts this turn mid-stream (see interrupt()).
   */
  async handleUserTurn(input: AgentTurnInput): Promise<void> {
    const { sessionId, deviceId, text, lang, persona, modality, consent } = input;
    const startedAt = Date.now();

    // A new input supersedes whatever this seat was still generating.
    this.interrupt(deviceId);
    const ctrl = new AbortController();
    this.activeTurns.set(deviceId, ctrl);
    const turnNo = this.hub.beginTurn(sessionId);

    this.recorder.start(sessionId, deviceId, persona, consent);
    this.recorder.addTurn(sessionId, {
      role: "user",
      modality,
      lang,
      transcript: text,
      at: new Date().toISOString(),
    });

    // The seat's earlier conversation, replayed so the turn is not an amnesiac
    // one-shot: the recorder already holds exactly what was said on this
    // session (a reset starts a new sessionId, so a new visitor starts clean).
    // The turn we just recorded above is dropped — it goes in as userText.
    const history = this.historyFor(sessionId, deviceId, persona);

    // Offline / demo mode (host-forced or network down) or no usable LLM →
    // serve a scripted, telemetry-grounded canned reply. The router resolves
    // the provider/endpoint from the operator-config global (TTL-cached).
    const llm = await this.llm.current();
    this.hub.setLlmConfigured(llm !== null);
    // A newer input may have barged in while we awaited the (possibly
    // CMS-refreshing) config above. That turn owns the seat now — close this
    // one quietly before it emits any phase/emotion.
    if (ctrl.signal.aborted) {
      this.hub.emitChatDelta(sessionId, "", true, turnNo);
      this.recordCosimoTurn(sessionId, lang, "", undefined, "neutral", startedAt, modality, "interrupted");
      this.persist(sessionId);
      return;
    }
    if (this.hub.isOfflineMode() || !llm) {
      await this.handleCannedTurn(sessionId, deviceId, text, lang, persona, modality, startedAt, turnNo, ctrl.signal);
      this.persist(sessionId);
      return;
    }

    this.hub.emitPhase("thinking", sessionId, turnNo);
    this.hub.setEmotion("thinking", sessionId, turnNo);

    // Core prompt is CMS-editable (operator-config, refreshed by llm.current()
    // just above); the rider section is always appended in code.
    const system = buildSystemPrompt(
      this.personas.get(persona),
      this.operatorConfig.get().agent.systemPrompt,
    );
    // Watchdog: a hung LLM stream must never strand the seat in "thinking".
    // The combined signal kills the HTTP stream either on barge-in (ctrl) or
    // after 90s; only ctrl counts as "interrupted" — a watchdog abort lands in
    // the catch below and degrades to the canned fallback + idle.
    const turn = llm.startTurn(
      system,
      text,
      AbortSignal.any([ctrl.signal, AbortSignal.timeout(90_000)]),
      history,
    );

    let assistantText = "";
    let startedSpeaking = false;
    let chosenEmotion: ExpressiveEmotion = "neutral";
    let lastAction: TurnAction | undefined;
    let outcome: Turn["outcome"] = "ok";
    /** True when the fallback already emitted done + idle (emitFullReply). */
    let streamClosed = false;

    try {
      // Manual tool-use loop: iterate until the model stops calling tools.
      for (let guard = 0; guard < 6; guard++) {
        const { toolCalls } = await turn.step((delta) => {
          if (ctrl.signal.aborted) return; // barged-in — swallow late chunks
          if (!startedSpeaking) {
            startedSpeaking = true;
            // Phase label only. The "speaking" Face (moving mouth) is driven by
            // actual audio playback on the client, so it stays in sync with the
            // voice rather than with the (silent) text stream.
            this.hub.emitPhase("speaking", sessionId, turnNo);
          }
          assistantText += delta;
          this.hub.emitChatDelta(sessionId, delta, false, turnNo);
        });

        if (toolCalls.length === 0 || ctrl.signal.aborted) break;

        // Execute every tool call, then feed all results back in one batch.
        // A barge-in does NOT abort a running tool (never leave the cabin in a
        // half-applied state); we stop before the next generation step instead.
        const results: { id: string; text: string }[] = [];
        for (const call of toolCalls) {
          const res = await executeTool(call.name, call.input, {
            hub: this.hub,
            telemetry: this.telemetry,
            personas: this.personas,
            profiles: this.profiles,
            lang,
            deviceId,
            sessionId,
            turn: turnNo,
            persona,
            consent,
          });
          if (res.emotion) chosenEmotion = res.emotion;
          else if (res.action && res.action.tool !== "set_emotion") lastAction = res.action;
          results.push({ id: call.id, text: res.text });
        }
        if (ctrl.signal.aborted) break;
        turn.addToolResults(results);
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        outcome = "error";
        // Graceful recovery: fall back to a grounded canned reply rather than
        // a dead end. If the canned matcher has a real answer (speed, light…)
        // use it; otherwise be honest that something went wrong — the rider
        // WAS understood, the brain was unreachable ("Das habe ich nicht
        // verstanden" would be a lie here).
        if (!assistantText) {
          const matched = cannedReply(text, lang, this.telemetry.get());
          const fallback = matched.matched ? matched : errorReply(lang);
          assistantText = fallback.text;
          chosenEmotion = fallback.emotion;
          // If the canned answer claims a cabin action ("Ich schalte das
          // Licht an"), actually perform it — same as offline mode does.
          if (fallback.cabin) {
            try {
              await this.hub.applyCabinControl(deviceId, fallback.cabin.control, {
                on: fallback.cabin.on,
              });
              lastAction = {
                tool: "set_cabin_control",
                control: fallback.cabin.control,
                args: { on: fallback.cabin.on },
              };
            } catch {
              // light unreachable — still answer
            }
          }
          this.emitFullReply(sessionId, fallback.text, turnNo);
          streamClosed = true; // emitFullReply already sent done + idle
        }
        // eslint-disable-next-line no-console
        console.error("[cosimo-agent] turn failed:", err);
      }
    }

    if (ctrl.signal.aborted) {
      // Barge-in: close this turn's stream quietly. No canned fallback, no
      // phase/face changes — the interrupter (listening) or the next turn owns
      // the seat now. Record what was said so far as an interrupted turn.
      outcome = "interrupted";
      this.hub.emitChatDelta(sessionId, "", true, turnNo);
      this.recordCosimoTurn(sessionId, lang, assistantText, lastAction, chosenEmotion, startedAt, modality, outcome);
      this.persist(sessionId);
      return;
    }
    // Close out the stream and settle the Face on the chosen expressive
    // emotion — unless the error fallback already closed it (emitFullReply).
    if (!streamClosed) {
      this.hub.emitChatDelta(sessionId, "", true, turnNo);
      this.hub.emitPhase("idle", sessionId, turnNo);
    }
    this.hub.setEmotion(chosenEmotion, sessionId, turnNo);

    // Keep the controller registered through TTS so a barge-in during
    // synthesis still cancels the audio; clean up only if we're still current.
    await this.speak(sessionId, assistantText, lang, persona, turnNo, ctrl.signal);
    if (this.activeTurns.get(deviceId) === ctrl) this.activeTurns.delete(deviceId);
    this.recordCosimoTurn(sessionId, lang, assistantText, lastAction, chosenEmotion, startedAt, modality, outcome);
    this.persist(sessionId);
  }

  /**
   * The replayed conversation for a seat: this session's recorded turns minus
   * the current user turn, capped to the most recent HISTORY_MESSAGES. Sourced
   * from the recorder so there is one memory of what was said, not two.
   */
  private historyFor(
    sessionId: string,
    deviceId: string,
    persona: PersonaKey,
  ): LlmHistoryMessage[] {
    const turns = this.recorder.get(sessionId)?.turns ?? [];
    // The user turn for THIS turn is already recorded — it is the last one.
    const current = Math.max(0, turns.length - 1);
    const mark = this.historyStart.get(deviceId);
    // New seat, a different profile than last turn, or a fresh session → the
    // conversation starts here.
    const from =
      mark && mark.persona === persona && mark.from <= current ? mark.from : current;
    this.historyStart.set(deviceId, { persona, from });
    return turns
      .slice(from, -1)
      .slice(-HISTORY_MESSAGES)
      .map((t) => ({
        role: t.role === "user" ? ("user" as const) : ("assistant" as const),
        text: t.transcript,
      }));
  }

  /**
   * Serve a scripted, telemetry-grounded canned reply (offline/demo mode). Can
   * still drive the cabin light, speaks via TTS, and records the turn.
   */
  private async handleCannedTurn(
    sessionId: string,
    deviceId: string,
    text: string,
    lang: Locale,
    persona: PersonaKey,
    modality: Modality,
    startedAt: number,
    turnNo: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const reply = cannedReply(text, lang, this.telemetry.get());

    let action: TurnAction | undefined;
    if (reply.cabin) {
      try {
        await this.hub.applyCabinControl(deviceId, reply.cabin.control, { on: reply.cabin.on });
        action = { tool: "set_cabin_control", control: reply.cabin.control, args: { on: reply.cabin.on } };
      } catch {
        // light unreachable — still answer
      }
    }

    this.hub.emitPhase("speaking", sessionId, turnNo);
    this.hub.emitChatDelta(sessionId, reply.text, false, turnNo);
    this.hub.emitChatDelta(sessionId, "", true, turnNo);
    this.hub.emitPhase("idle", sessionId, turnNo);
    this.hub.setEmotion(reply.emotion, sessionId, turnNo);

    await this.speak(sessionId, reply.text, lang, persona, turnNo, signal);
    this.recordCosimoTurn(
      sessionId, lang, reply.text, action, reply.emotion, startedAt, modality,
      reply.matched ? "offline_canned" : "not_understood",
    );
  }

  /** Upsert the (consented) session into the CMS — best-effort, fire-and-forget. */
  private persist(sessionId: string): void {
    const rec = this.recorder.get(sessionId);
    if (rec) void this.sink.save(rec);
  }

  /**
   * Speak the reply via server TTS when available and the persona wants audio.
   * When no server TTS is configured the client speaks locally (Web Speech), so
   * this is a no-op. Never throws — speech is best-effort.
   */
  private async speak(
    sessionId: string,
    text: string,
    lang: Locale,
    persona: PersonaKey,
    turnNo: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.tts.available || !text.trim()) return;
    if (!this.personas.get(persona).accommodations.audioOutput) return;
    try {
      const audio = await this.tts.synthesize(text, lang);
      // Barge-in during synthesis → never ship the stale clip.
      if (signal?.aborted) return;
      if (audio) this.hub.emitTtsAudio(sessionId, audio.audioBase64, audio.mime, turnNo);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[cosimo-agent] tts failed:", err);
    }
  }

  /**
   * Push a server-initiated announcement to one kiosk (e.g. the NFC
   * "account registered" greeting): text, Face emotion, and speech.
   */
  async announce(
    sessionId: string,
    text: string,
    lang: Locale,
    persona: PersonaKey,
    emotion: ExpressiveEmotion = "happy",
  ): Promise<void> {
    // An announcement is a turn of its own — it supersedes whatever streams.
    const turnNo = this.hub.beginTurn(sessionId);
    this.emitFullReply(sessionId, text, turnNo);
    this.hub.setEmotion(emotion, sessionId, turnNo);
    await this.speak(sessionId, text, lang, persona, turnNo);
  }

  /** Emit a complete reply as a single delta + done (offline / error paths). */
  private emitFullReply(sessionId: string, text: string, turnNo: number): void {
    this.hub.emitPhase("speaking", sessionId, turnNo);
    this.hub.emitChatDelta(sessionId, text, false, turnNo);
    this.hub.emitChatDelta(sessionId, "", true, turnNo);
    this.hub.emitPhase("idle", sessionId, turnNo);
  }

  private recordCosimoTurn(
    sessionId: string,
    lang: Locale,
    transcript: string,
    action: TurnAction | undefined,
    faceEmotion: ExpressiveEmotion,
    startedAt: number,
    modality: Modality,
    outcome: Turn["outcome"],
  ): void {
    this.recorder.addTurn(sessionId, {
      role: "cosimo",
      modality,
      lang,
      transcript,
      action,
      faceEmotion,
      latencyMs: Date.now() - startedAt,
      outcome,
      at: new Date().toISOString(),
    });
  }
}
