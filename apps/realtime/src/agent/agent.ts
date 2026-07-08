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
  type Turn,
  type TurnAction,
} from "@cosimo/shared";
import type { Hub } from "../hub.js";
import { buildSystemPrompt } from "./prompt.js";
import type { LlmRouter } from "./llm.js";
import { PersonaProvider } from "./personas.js";
import { SessionRecorder } from "./recorder.js";
import { TelemetryProvider } from "./telemetry.js";
import { executeTool } from "./tools.js";
import { PayloadSink } from "./sink.js";
import { cannedReply } from "./canned.js";
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

export class CosimoAgent {
  private readonly llm: LlmRouter;
  private readonly hub: Hub;
  private readonly telemetry: TelemetryProvider;
  readonly personas: PersonaProvider;
  private readonly tts: TtsProvider;
  private readonly sink = new PayloadSink();
  readonly recorder = new SessionRecorder();

  constructor(
    hub: Hub,
    personas: PersonaProvider,
    tts: TtsProvider,
    telemetry: TelemetryProvider,
    llm: LlmRouter,
  ) {
    this.hub = hub;
    this.personas = personas;
    this.tts = tts;
    this.telemetry = telemetry;
    this.llm = llm;
    this.hub.setLlmConfigured(this.llm.maybeConfigured());
  }

  /**
   * Handle one user turn end-to-end. Records the user turn, runs the agent
   * loop, streams the reply, records the CoSiMo turn.
   */
  async handleUserTurn(input: AgentTurnInput): Promise<void> {
    const { sessionId, deviceId, text, lang, persona, modality, consent } = input;
    const startedAt = Date.now();

    this.recorder.start(sessionId, deviceId, persona, consent);
    this.recorder.addTurn(sessionId, {
      role: "user",
      modality,
      lang,
      transcript: text,
      at: new Date().toISOString(),
    });

    // Offline / demo mode (host-forced or network down) or no usable LLM →
    // serve a scripted, telemetry-grounded canned reply. The router resolves
    // the provider/endpoint from the operator-config global (TTL-cached).
    const llm = await this.llm.current();
    this.hub.setLlmConfigured(llm !== null);
    if (this.hub.isOfflineMode() || !llm) {
      await this.handleCannedTurn(sessionId, deviceId, text, lang, persona, modality, startedAt);
      this.persist(sessionId);
      return;
    }

    this.hub.emitPhase("thinking", sessionId);
    this.hub.setEmotion("thinking", sessionId);

    const system = buildSystemPrompt(this.personas.get(persona));
    const turn = llm.startTurn(system, text);

    let assistantText = "";
    let startedSpeaking = false;
    let chosenEmotion: ExpressiveEmotion = "neutral";
    let lastAction: TurnAction | undefined;
    let outcome: Turn["outcome"] = "ok";

    try {
      // Manual tool-use loop: iterate until the model stops calling tools.
      for (let guard = 0; guard < 6; guard++) {
        const { toolCalls } = await turn.step((delta) => {
          if (!startedSpeaking) {
            startedSpeaking = true;
            // Phase label only. The "speaking" Face (moving mouth) is driven by
            // actual audio playback on the client, so it stays in sync with the
            // voice rather than with the (silent) text stream.
            this.hub.emitPhase("speaking", sessionId);
          }
          assistantText += delta;
          this.hub.emitChatDelta(sessionId, delta, false);
        });

        if (toolCalls.length === 0) break;

        // Execute every tool call, then feed all results back in one batch.
        const results: { id: string; text: string }[] = [];
        for (const call of toolCalls) {
          const res = await executeTool(call.name, call.input, {
            hub: this.hub,
            telemetry: this.telemetry,
            lang,
            deviceId,
          });
          if (res.emotion) chosenEmotion = res.emotion;
          else if (res.action && res.action.tool !== "set_emotion") lastAction = res.action;
          results.push({ id: call.id, text: res.text });
        }
        turn.addToolResults(results);
      }
    } catch (err) {
      outcome = "error";
      // Graceful recovery: fall back to a grounded canned reply rather than a
      // dead end, so a transient cloud/network blip never breaks the demo.
      if (!assistantText) {
        const fallback = cannedReply(text, lang, this.telemetry.get());
        assistantText = fallback.text;
        chosenEmotion = fallback.emotion;
        this.emitFullReply(sessionId, fallback.text);
      }
      // eslint-disable-next-line no-console
      console.error("[cosimo-agent] turn failed:", err);
    }

    // Close out the stream and settle the Face on the chosen expressive emotion.
    this.hub.emitChatDelta(sessionId, "", true);
    this.hub.emitPhase("idle", sessionId);
    this.hub.setEmotion(chosenEmotion, sessionId);

    await this.speak(sessionId, assistantText, lang, persona);
    this.recordCosimoTurn(sessionId, lang, assistantText, lastAction, chosenEmotion, startedAt, modality, outcome);
    this.persist(sessionId);
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

    this.hub.emitPhase("speaking", sessionId);
    this.hub.emitChatDelta(sessionId, reply.text, false);
    this.hub.emitChatDelta(sessionId, "", true);
    this.hub.emitPhase("idle", sessionId);
    this.hub.setEmotion(reply.emotion, sessionId);

    await this.speak(sessionId, reply.text, lang, persona);
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
  private async speak(sessionId: string, text: string, lang: Locale, persona: PersonaKey): Promise<void> {
    if (!this.tts.available || !text.trim()) return;
    if (!this.personas.get(persona).presentation.speakAloud) return;
    try {
      const audio = await this.tts.synthesize(text, lang);
      if (audio) this.hub.emitTtsAudio(sessionId, audio.audioBase64, audio.mime);
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
    this.emitFullReply(sessionId, text);
    this.hub.setEmotion(emotion, sessionId);
    await this.speak(sessionId, text, lang, persona);
  }

  /** Emit a complete reply as a single delta + done (offline / error paths). */
  private emitFullReply(sessionId: string, text: string): void {
    this.hub.emitPhase("speaking", sessionId);
    this.hub.emitChatDelta(sessionId, text, false);
    this.hub.emitChatDelta(sessionId, "", true);
    this.hub.emitPhase("idle", sessionId);
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
