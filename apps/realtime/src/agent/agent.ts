/**
 * The CoSiMo agent loop — the brain. Runs a streaming Claude tool-use loop:
 * streams reply text to the iPads for latency masking, executes cabin/telemetry
 * tools, lets Claude colour the Face via set_emotion, and records the turn.
 *
 * Face/phase choreography (Phase 1): thinking while working → speaking while the
 * reply streams → settle on Claude's chosen expressive emotion (or neutral).
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  type ExpressiveEmotion,
  type Locale,
  type Modality,
  type PersonaKey,
  type Turn,
  type TurnAction,
} from "@cosimo/shared";
import { config } from "../config.js";
import type { Hub } from "../hub.js";
import { buildSystemPrompt } from "./prompt.js";
import { PersonaProvider } from "./personas.js";
import { SessionRecorder } from "./recorder.js";
import { TelemetryProvider } from "./telemetry.js";
import { TOOL_DEFINITIONS, executeTool } from "./tools.js";
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
  private readonly client: Anthropic | null;
  private readonly hub: Hub;
  private readonly telemetry: TelemetryProvider;
  readonly personas: PersonaProvider;
  private readonly tts: TtsProvider;
  readonly recorder = new SessionRecorder();

  constructor(hub: Hub, personas: PersonaProvider, tts: TtsProvider, telemetry: TelemetryProvider) {
    this.hub = hub;
    this.personas = personas;
    this.tts = tts;
    this.telemetry = telemetry;
    this.client = config.anthropic.apiKey
      ? new Anthropic({ apiKey: config.anthropic.apiKey })
      : null;
    this.hub.setStatus({ llm: this.client !== null });
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

    // No API key → graceful offline reply (real canned mode arrives in Phase 8).
    if (!this.client) {
      const offline =
        lang === "de"
          ? "Ich bin gerade offline – die Verbindung fehlt. Bitte versuche es gleich noch einmal."
          : "I'm offline right now — no connection. Please try again in a moment.";
      this.emitFullReply(sessionId, offline);
      await this.speak(sessionId, offline, lang, persona);
      this.recordCosimoTurn(sessionId, lang, offline, undefined, "neutral", startedAt, modality, "offline_canned");
      return;
    }

    this.hub.emitPhase("thinking", sessionId);
    this.hub.setEmotion("thinking");

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: text }];
    const system = buildSystemPrompt(this.personas.get(persona));

    let assistantText = "";
    let startedSpeaking = false;
    let chosenEmotion: ExpressiveEmotion = "neutral";
    let lastAction: TurnAction | undefined;
    let outcome: Turn["outcome"] = "ok";

    try {
      // Manual tool-use loop: iterate until Claude stops calling tools.
      for (let guard = 0; guard < 6; guard++) {
        const stream = this.client.messages.stream({
          model: config.anthropic.model,
          max_tokens: 1024,
          thinking: { type: "adaptive" },
          system,
          tools: TOOL_DEFINITIONS,
          messages,
        });

        stream.on("text", (delta) => {
          if (!startedSpeaking) {
            startedSpeaking = true;
            this.hub.emitPhase("speaking", sessionId);
            this.hub.setEmotion("speaking");
          }
          assistantText += delta;
          this.hub.emitChatDelta(sessionId, delta, false);
        });

        const message = await stream.finalMessage();
        messages.push({ role: "assistant", content: message.content });

        if (message.stop_reason !== "tool_use") break;

        // Execute every tool call, then feed all results back in one user turn.
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of message.content) {
          if (block.type !== "tool_use") continue;
          const res = await executeTool(
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            { hub: this.hub, telemetry: this.telemetry, lang },
          );
          if (res.emotion) chosenEmotion = res.emotion;
          else if (res.action && res.action.tool !== "set_emotion") lastAction = res.action;
          results.push({ type: "tool_result", tool_use_id: block.id, content: res.text });
        }
        messages.push({ role: "user", content: results });
      }
    } catch (err) {
      outcome = "error";
      const msg =
        lang === "de"
          ? "Entschuldige, da ist etwas schiefgelaufen. Magst du es noch einmal versuchen?"
          : "Sorry, something went wrong. Could you try that again?";
      if (!assistantText) {
        assistantText = msg;
        this.emitFullReply(sessionId, msg);
      }
      // eslint-disable-next-line no-console
      console.error("[cosimo-agent] turn failed:", err);
    }

    // Close out the stream and settle the Face on the chosen expressive emotion.
    this.hub.emitChatDelta(sessionId, "", true);
    this.hub.emitPhase("idle", sessionId);
    this.hub.setEmotion(chosenEmotion);

    await this.speak(sessionId, assistantText, lang, persona);
    this.recordCosimoTurn(sessionId, lang, assistantText, lastAction, chosenEmotion, startedAt, modality, outcome);
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
