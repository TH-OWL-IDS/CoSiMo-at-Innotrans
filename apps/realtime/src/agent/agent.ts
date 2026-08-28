/**
 * The CoSiMo agent loop — the brain. Runs a streaming Claude tool-use loop:
 * streams reply text to the iPads for latency masking, executes cabin/telemetry
 * tools, lets Claude colour the Face via set_emotion, and records the turn.
 *
 * Face/phase choreography (Phase 1): thinking while working → speaking while the
 * reply streams → settle on Claude's chosen expressive emotion (or neutral).
 */

import {
  type Persona,
  type RiderContext,
  type LlmTestResult,
  type Accommodations,
  CABIN_CONTROLS,
  type ExpressiveEmotion,
  type Locale,
  type Modality,
  type PersonaKey,
  type SeatInspection,
  type TurnAction,
  type TurnOutcome,
} from "@cosimo/shared";
import type { Hub } from "../hub.js";
import { buildSystemPrompt, detectLang, journeyLine } from "./prompt.js";
import type { LlmHistoryAction, LlmHistoryMessage, LlmRouter } from "./llm.js";
import type { OperatorConfigProvider } from "./operatorConfig.js";
import { PersonaProvider } from "./personas.js";
import { SessionRecorder } from "./recorder.js";
import { TelemetrySimulation } from "./telemetry.js";
import { executeTool } from "./tools.js";
import { PayloadSink } from "./sink.js";
import { ProfileSink } from "./profileSink.js";
import { cannedReply, errorReply } from "./canned.js";
import type { TtsProvider } from "../speech/tts.js";
import { logger } from "../log/logger.js";
import { TurnSpeaker } from "../speech/speaker.js";
import { CUSTOMIZE_STEPS, customizeCard, customizeDone, localAnswer } from "./cards.js";

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
  /** How long server STT took for this utterance (voice turns). */
  sttMs?: number;
  /** The seat's rider — accommodations LIVE, traits, memories, consent. */
  rider: RiderContext;
}

/**
 * How many earlier messages of a seat's conversation are replayed to the model.
 * A turn is one message, so this is ~6 exchanges — enough for "say that again",
 * "and the next stop?", or a rider correcting themselves, without growing the
 * prompt (and the latency) unboundedly over a long booth session.
 */
const HISTORY_MESSAGES = 12;

/** A CoSiMo turn worth replaying: a real sentence from a successful turn,
 *  or any turn that did something (its tool calls are the useful part). */
function isReplayable(text: string, outcome: string | undefined, actions: number): boolean {
  if (outcome === "error" || outcome === "not_understood") return false;
  if (actions > 0) return true;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 3;
}

/** The tool calls of a recorded turn, as the model should see them again. */
function historyActions(actions: TurnAction[] | undefined, turnIndex: number): LlmHistoryAction[] | undefined {
  if (!actions?.length) return undefined;
  return actions.map((a, j) => ({
    id: `hist-${turnIndex}-${j}`,
    name: a.tool,
    // The recorder keeps `control` beside `args`; the model saw them as one object.
    args: { ...(a.control ? { control: a.control } : {}), ...(a.args ?? {}) },
    result: a.result ?? (a.ok === false ? "error" : "ok"),
  }));
}

/** Below this, a tool-less reply is a degenerate sample, not an answer. */
const DEGENERATE_CHARS = 4;

/**
 * Tools whose spoken confirmation does not depend on their result: when the
 * model says the sentence in the same message as the call ("speak while
 * acting") and every call succeeded, the result round-trip is skipped —
 * that second generation was 1–2 s of every action turn. get_telemetry is
 * NOT here: an answer about the journey needs the data first. A failed tool
 * still gets the extra round so the model can correct itself.
 */
const SPEAK_WHILE_ACTING = new Set([
  "set_cabin_control",
  "set_presentation",
  "set_emotion",
  "request_stop",
  "remember",
  "forget",
]);

/**
 * The spoken confirmation for a result-independent action, templated
 * server-side. The Qwen3-Coder template never says text in the same message
 * as a tool call (measured 1/9), so asking the model costs a whole second
 * generation just to hear "das Licht ist an" — a sentence the server already
 * knows. Model text is preferred whenever the model does produce it.
 */
/** German articles per control — "die Leselampe", not "das Leselampe". */
const DE_ARTICLE: Record<string, string> = {
  "interior-light": "das",
  "reading-lamp": "die",
};

function templatedConfirmation(actions: TurnAction[], lang: Locale, terse = false): string {
  const de = lang === "de";
  // a terse rider gets the bare word, whatever was done
  if (terse && actions.some((a) => ["set_cabin_control", "set_presentation", "request_stop", "remember", "forget"].includes(a.tool))) {
    return de ? "Erledigt." : "Done.";
  }
  const parts: string[] = [];
  const cabin = actions.filter((a) => a.tool === "set_cabin_control" && a.control);
  if (cabin.length) {
    const bits = cabin.map((a) => {
      const def = CABIN_CONTROLS.find((c) => c.id === a.control);
      const label = def?.label[lang] ?? a.control!;
      const args = a.args ?? {};
      if (typeof args.level === "number") {
        return de ? `${DE_ARTICLE[a.control!] ?? "das"} ${label} auf ${args.level} Prozent` : `the ${label.toLowerCase()} at ${args.level} percent`;
      }
      const on = args.on !== false;
      return de ? `${DE_ARTICLE[a.control!] ?? "das"} ${label} ${on ? "an" : "aus"}` : `the ${label.toLowerCase()} ${on ? "on" : "off"}`;
    });
    const list = bits.length > 1 ? bits.slice(0, -1).join(", ") + (de ? " und " : " and ") + bits[bits.length - 1] : bits[0]!;
    parts.push(de ? `Gern, ${list}.` : `Sure, ${list}.`);
  }
  // One sentence per KIND, not per call — "leiser UND langsamer" is two
  // set_presentation actions but must confirm once, not twice.
  const kinds = new Set(actions.map((a) => a.tool));
  if (kinds.has("set_presentation")) {
    const n = actions.filter((a) => a.tool === "set_presentation").length;
    parts.push(de
      ? n > 1 ? "Erledigt, ich habe beides angepasst." : "Erledigt, ich habe das angepasst."
      : n > 1 ? "Done, I have adjusted both." : "Done, I have adjusted that.");
  }
  if (kinds.has("request_stop")) parts.push(de ? "Dein Haltewunsch ist registriert." : "Your stop request is registered.");
  if (kinds.has("remember")) parts.push(de ? "Das habe ich mir gemerkt." : "I will remember that.");
  if (kinds.has("forget")) parts.push(de ? "Erledigt, das habe ich vergessen." : "Done, I have forgotten that.");
  return parts.slice(0, 2).join(" ") || (de ? "Erledigt." : "Done.");
}

export class CosimoAgent {
  private readonly llm: LlmRouter;
  private readonly operatorConfig: OperatorConfigProvider;
  private readonly hub: Hub;
  private readonly telemetry: TelemetrySimulation;
  readonly personas: PersonaProvider;
  private readonly tts: TtsProvider;
  private readonly sink = new PayloadSink();
  private readonly profiles = new ProfileSink();
  /** For index.ts: consent persistence shares the same sink. */
  get profileSink(): ProfileSink { return this.profiles; }
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
        (() => { const r = this.hub.riderOf(sessionId); return r ? this.profileFor(r) : this.personas.get(persona); })(),
        this.operatorConfig.get().agent.systemPrompt,
        this.operatorConfig.get().tts.voices,
        journeyLine(this.telemetry.get(), this.hub.riderOf(sessionId)?.accommodations.language ?? "de"),
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
    const { sessionId, deviceId, text, persona, modality, consent, sttMs, rider } = input;
    // The turn speaks the rider's language of THIS utterance: journey line,
    // templated confirmations, cards and TTS all follow it (profile = fallback).
    const lang = detectLang(text, input.lang);
    const startedAt = Date.now();
    const ctx = { deviceId, sessionId, turn: -1 };
    // A new turn invalidates any option card still on screen — the rider
    // either answered it (this turn) or moved on.
    this.hub.showCard(sessionId, null, -1);

    // A new input supersedes whatever this seat was still generating.
    this.interrupt(deviceId);
    const ctrl = new AbortController();
    this.activeTurns.set(deviceId, ctrl);
    const turnNo = this.hub.beginTurn(sessionId);
    ctx.turn = turnNo;

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
    const llmInfo = llm ? { provider: llm.kind + (this.llm.onFallback ? " (fallback)" : ""), model: llm.model } : null;
    const canned = this.hub.isOfflineMode() || !llm;
    logger.log(
      "turn.start",
      { text, modality, lang, persona, consent, llm: canned ? null : llmInfo, historyMessages: history.length },
      ctx,
    );
    // A newer input may have barged in while we awaited the (possibly
    // CMS-refreshing) config above. That turn owns the seat now — close this
    // one quietly before it emits any phase/emotion.
    if (ctrl.signal.aborted) {
      this.hub.emitChatDelta(sessionId, "", true, turnNo);
      this.recordCosimoTurn(sessionId, lang, "", [], "neutral", startedAt, modality, "interrupted", { sttMs });
      this.persist(sessionId);
      return;
    }
    if (canned || !llm) {
      await this.handleCannedTurn(sessionId, deviceId, text, lang, persona, modality, startedAt, turnNo, ctrl.signal, sttMs);
      this.persist(sessionId);
      return;
    }

    this.hub.emitPhase("thinking", sessionId, turnNo);
    this.hub.setEmotion("thinking", sessionId, turnNo);

    // Core prompt is CMS-editable (operator-config, refreshed by llm.current()
    // just above); the rider section is always appended in code.
    // The live journey rides the prompt: one generation for the common
    // questions; get_telemetry only for what the line leaves out.
    this.telemetry.update();
    const system = buildSystemPrompt(
      this.profileFor(rider),
      this.operatorConfig.get().agent.systemPrompt,
      this.operatorConfig.get().tts.voices,
      journeyLine(this.telemetry.get(), lang),
      lang,
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
    /** Every tool call of this turn, in order — the record and the log. */
    const actions: TurnAction[] = [];
    let outcome: TurnOutcome = "ok";
    let errorMessage: string | undefined;
    /** True when the fallback already emitted done + idle (emitFullReply). */
    let streamClosed = false;
    // Speech streams as the text does: every finished sentence is synthesized
    // and shipped while the model still writes the next one.
    const traits = rider.traits;
    const speaker = this.newSpeaker(sessionId, persona, lang, turnNo, startedAt, ctrl.signal);
    const llmStarted = Date.now();
    let llmMs = 0;

    try {
      // Manual tool-use loop: iterate until the model stops calling tools.
      let retried = false;
      for (let guard = 0; guard < 6; guard++) {
        const stepStarted = Date.now();
        let stepChars = 0;
        let stepText = "";
        const { toolCalls, finish } = await turn.step((delta) => {
          stepChars += delta.length;
          stepText += delta;
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
          speaker.push(delta);
        });

        logger.log(
          "llm.step",
          {
            step: guard,
            chars: stepChars,
            toolCalls: toolCalls.map((c) => c.name),
            durationMs: Date.now() - stepStarted,
            ...(finish ? { finish } : {}),
          },
          { ...ctx, level: finish === "length" ? "warn" : "debug" },
        );
        if (ctrl.signal.aborted) break;
        // A one-token "answer" with no tool call is a bad sample ("II",
        // "Kein"). Retry the step once before the rider hears it.
        if (
          toolCalls.length === 0 &&
          !retried &&
          stepText.trim().length < DEGENERATE_CHARS &&
          assistantText.trim().length < DEGENERATE_CHARS
        ) {
          retried = true;
          logger.log(
            "llm.step",
            { step: guard, chars: stepChars, toolCalls: [], durationMs: 0, finish: "degenerate→retry" },
            { ...ctx, level: "warn" },
          );
          assistantText = "";
          speaker.discard();
          turn.retractLastAssistant();
          continue;
        }
        if (toolCalls.length === 0) break;

        // Execute every tool call, then feed all results back in one batch.
        // A barge-in does NOT abort a running tool (never leave the cabin in a
        // half-applied state); we stop before the next generation step instead.
        const results: { id: string; text: string }[] = [];
        let stepToolFailed = false;
        for (const call of toolCalls) {
          const t0 = Date.now();
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
            voices: this.operatorConfig.get().tts.voices,
          });
          const durationMs = Date.now() - t0;
          const ok = !res.text.startsWith("error");
          if (!ok) stepToolFailed = true;
          logger.log(
            "tool.call",
            { tool: call.name, input: call.input, result: res.text, ok, durationMs },
            { ...ctx, level: ok ? "info" : "warn" },
          );
          if (res.emotion) chosenEmotion = res.emotion;
          actions.push({
            ...(res.action ?? { tool: call.name }),
            args: res.action?.args ?? call.input,
            result: res.text.slice(0, 2_000),
            ok,
            durationMs,
          });
          results.push({ id: call.id, text: res.text });
        }
        if (ctrl.signal.aborted) break;
        // The model always speaks the confirmation itself: feed the results
        // back and let the next step put it in its own words. (The former
        // server-templated shortcut saved ~1 s on the dense 27B; on the A3B a
        // step is ~0.75 s and the rider hears a real sentence instead of
        // "Erledigt, ich habe das angepasst." every time.) The template only
        // remains as the fallback below, if that step comes back empty.
        turn.addToolResults(results);
      }
    } catch (err) {
      llmMs = Date.now() - llmStarted;
      if (!ctrl.signal.aborted) {
        outcome = "error";
        errorMessage = err instanceof Error ? err.message : String(err);
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
              actions.push({
                tool: "set_cabin_control",
                control: fallback.cabin.control,
                args: { on: fallback.cabin.on },
                ok: true,
              });
            } catch {
              // light unreachable — still answer
            }
          }
          this.emitFullReply(sessionId, fallback.text, turnNo);
          speaker.push(fallback.text);
          streamClosed = true; // emitFullReply already sent done + idle
        }
        // eslint-disable-next-line no-console
        console.error("[cosimo-agent] turn failed:", err);
      }
    }

    if (!llmMs) llmMs = Date.now() - llmStarted;
    if (ctrl.signal.aborted) {
      // Barge-in: close this turn's stream quietly. No canned fallback, no
      // phase/face changes — the interrupter (listening) or the next turn owns
      // the seat now. Record what was said so far as an interrupted turn.
      outcome = "interrupted";
      void speaker.finish(); // aborted: drains without shipping anything
      this.hub.emitChatDelta(sessionId, "", true, turnNo);
      this.recordCosimoTurn(sessionId, lang, assistantText, actions, chosenEmotion, startedAt, modality, outcome, {
        sttMs, llmMs, llm: llmInfo ?? undefined,
      });
      this.persist(sessionId);
      return;
    }
    // Nothing said although actions ran (an empty or degenerate step after
    // the tool results) → the template steps in, so the rider is never left
    // in silence after an action.
    if (!streamClosed && !assistantText.trim() && actions.some((a) => SPEAK_WHILE_ACTING.has(a.tool) && a.ok !== false)) {
      const fallback = templatedConfirmation(actions, lang, traits.verbosity === "terse");
      assistantText = fallback;
      if (!startedSpeaking) {
        startedSpeaking = true;
        this.hub.emitPhase("speaking", sessionId, turnNo);
      }
      this.hub.emitChatDelta(sessionId, fallback, false, turnNo);
      speaker.push(fallback);
      logger.log("llm.step", { step: -1, chars: fallback.length, toolCalls: [], durationMs: 0, finish: "template-fallback" }, { ...ctx, level: "warn" });
    }
    // ("Bestätigung nach jedem Schritt" is now a prompt matter — the model
    // always confirms in its own words; appending the template on top made
    // replies like "Das Thema ist Wald. Erledigt, ich habe das angepasst.")
    // A local card put on screen this turn must be heard, whatever the model
    // said ("Erledigt." happens): append its question deterministically.
    const shownCard = this.hub.cardOf(sessionId);
    if (!streamClosed && shownCard?.local && !assistantText.includes(shownCard.question) && !/[?？]\s*$/.test(assistantText.trim())) {
      const add = (assistantText.trim() ? " " : "") + shownCard.question;
      assistantText += add;
      if (!startedSpeaking) {
        startedSpeaking = true;
        this.hub.emitPhase("speaking", sessionId, turnNo);
      }
      this.hub.emitChatDelta(sessionId, add, false, turnNo);
      speaker.push(add);
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
    const { ttsMs } = await speaker.finish();
    if (this.activeTurns.get(deviceId) === ctrl) this.activeTurns.delete(deviceId);
    this.recordCosimoTurn(sessionId, lang, assistantText, actions, chosenEmotion, startedAt, modality, outcome, {
      sttMs, llmMs, ttsMs, llm: llmInfo ?? undefined, error: errorMessage,
    });
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
    return (
      turns
        .slice(from, -1)
        // A degenerate CoSiMo turn ("II", one word, an error reply) must not be
        // replayed: the model imitates its own history and the whole
        // conversation collapses into one-token answers (seen in prod).
        .map((t, i) => ({ t, i: from + i }))
        .filter(({ t }) => t.role === "user" || isReplayable(t.transcript, t.outcome, t.actions?.length ?? 0))
        .slice(-HISTORY_MESSAGES)
        .map(({ t, i }) => ({
          role: t.role === "user" ? ("user" as const) : ("assistant" as const),
          text: t.transcript,
          ...(t.role === "cosimo" ? { actions: historyActions(t.actions, i) } : {}),
        }))
    );
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
    sttMs?: number,
  ): Promise<void> {
    const reply = cannedReply(text, lang, this.telemetry.get());

    const actions: TurnAction[] = [];
    if (reply.cabin) {
      try {
        await this.hub.applyCabinControl(deviceId, reply.cabin.control, { on: reply.cabin.on });
        actions.push({ tool: "set_cabin_control", control: reply.cabin.control, args: { on: reply.cabin.on }, ok: true });
      } catch {
        // light unreachable — still answer
      }
    }

    this.hub.emitPhase("speaking", sessionId, turnNo);
    this.hub.emitChatDelta(sessionId, reply.text, false, turnNo);
    this.hub.emitChatDelta(sessionId, "", true, turnNo);
    this.hub.emitPhase("idle", sessionId, turnNo);
    this.hub.setEmotion(reply.emotion, sessionId, turnNo);

    const ttsMs = await this.speak(sessionId, reply.text, lang, persona, turnNo, signal);
    this.recordCosimoTurn(
      sessionId, lang, reply.text, actions, reply.emotion, startedAt, modality,
      reply.matched ? "offline_canned" : "not_understood", { sttMs, ttsMs },
    );
  }

  /** Upsert the (consented) session into the CMS — best-effort, fire-and-forget. */
  private persist(sessionId: string): void {
    const rec = this.recorder.get(sessionId);
    if (rec) void this.sink.save(rec);
  }

  /** The rider as the prompt builder sees it: profile identity + brief, but
   *  the SEAT's live accommodations, traits and memories. */
  private profileFor(rider: RiderContext): Persona {
    const profile = this.personas.get(rider.persona);
    return {
      ...profile,
      label: rider.label,
      accommodations: rider.accommodations,
      traits: rider.traits,
      memories: rider.memories.length ? rider.memories : profile.memories,
    };
  }

  /** A session ended (persona switch / reset): close and persist its record. */
  endSession(sessionId: string, deviceId: string): void {
    this.interrupt(deviceId);
    const rec = this.recorder.end(sessionId);
    if (rec) void this.sink.save(rec);
    this.historyStart.delete(deviceId);
  }

  /** The seat's voice + whether it wants audio at all, for one turn. */
  private newSpeaker(
    sessionId: string,
    persona: PersonaKey,
    lang: Locale,
    turnNo: number,
    startedAt: number,
    signal?: AbortSignal,
  ): TurnSpeaker {
    // The SEAT's live accommodations, not the profile: a walk-up's
    // set_presentation changes exist only on the seat (the profile is the
    // shared clean plate and stays untouched). Same source the client renders.
    const accNow = () => this.hub.accommodationsOf(sessionId) ?? this.personas.get(persona).accommodations;
    return new TurnSpeaker({
      tts: this.tts,
      hub: this.hub,
      sessionId,
      turn: turnNo,
      lang,
      // read again for every sentence: a set_presentation in this turn
      // (tempo, voice, tone) must shape its own confirmation
      voice: () => {
        const acc = accNow();
        return {
          rate: acc.speechRate ?? 1,
          gender: acc.voiceGender ?? "female",
          tone: acc.voiceTone ?? "neutral",
          voiceKey: acc.voice,
        };
      },
      enabled: this.tts.available && accNow().audioOutput,
      signal,
      startedAt,
    });
  }

  /**
   * Speak a complete text (canned replies, announcements). Same streaming
   * path as a live turn — the text just arrives all at once. Never throws.
   */
  private async speak(
    sessionId: string,
    text: string,
    lang: Locale,
    persona: PersonaKey,
    turnNo: number,
    signal?: AbortSignal,
  ): Promise<number | undefined> {
    if (!text.trim()) return undefined;
    const speaker = this.newSpeaker(sessionId, persona, lang, turnNo, Date.now(), signal);
    speaker.push(text);
    return (await speaker.finish()).ttsMs;
  }

  /**
   * A tap on a LOCAL card: the hub applies the setting itself (no LLM round)
   * and CoSiMo still answers audio-visually — a short templated line, spoken
   * in the NEW setting (the new voice, the new volume …). Wizard cards chain
   * to the next step; the closing line says whether it persists.
   */
  async handleCardAnswer(input: { sessionId: string; deviceId: string; cardId: string; value: string; lang: Locale; persona: PersonaKey }): Promise<void> {
    const { sessionId, deviceId, cardId, value, lang, persona } = input;
    const card = this.hub.cardOf(sessionId);
    if (!card || card.id !== cardId || !card.local) return;
    const voices = this.operatorConfig.get().tts.voices;
    const before = this.hub.accommodationsOf(sessionId) ?? this.personas.get(persona).accommodations;
    const turnNo = this.hub.beginTurn(sessionId);
    const startedAt = Date.now();
    const lines: string[] = [];
    let applied: Partial<Accommodations> | undefined;

    if (value !== "__skip" && value !== "__done") {
      const ans = localAnswer(card, value, lang, voices, before);
      if (!ans) {
        logger.log("card.answer", { kind: card.kind, value }, { deviceId, sessionId, turn: turnNo, level: "warn" });
        return;
      }
      const next = this.hub.patchSeatAccommodations(deviceId, ans.patch);
      if (next) this.persistAccommodations(persona, next);
      applied = ans.patch;
      lines.push(ans.spoken);
    }
    logger.log("card.answer", { kind: card.kind, value, ...(applied ? { applied } : {}) }, { deviceId, sessionId, turn: turnNo });
    this.recorder.addTurn(sessionId, { role: "user", modality: "tap", lang, transcript: `[${card.kind}] ${value}`, at: new Date().toISOString() });

    if (card.step) {
      const nextIdx = card.step.index + 1;
      if (value === "__done" || nextIdx >= CUSTOMIZE_STEPS.length) {
        this.hub.setWizardStep(sessionId, undefined);
        this.hub.showCard(sessionId, null, turnNo);
        lines.push(customizeDone(lang, this.personas.isPersistable(persona)));
      } else {
        const acc = this.hub.accommodationsOf(sessionId) ?? before;
        const nextCard = customizeCard(nextIdx, lang, voices, acc);
        if (nextCard) {
          this.hub.setWizardStep(sessionId, nextIdx);
          lines.push(nextCard.question);
          this.hub.showCard(sessionId, nextCard, turnNo);
        }
      }
    } else {
      this.hub.showCard(sessionId, null, turnNo);
    }

    const spoken = lines.join(" ");
    this.emitFullReply(sessionId, spoken, turnNo);
    this.hub.setEmotion("happy", sessionId, turnNo);
    const ttsMs = await this.speak(sessionId, spoken, lang, persona, turnNo);
    const [setting, v] = applied ? Object.entries(applied)[0] ?? [] : [];
    this.recordCosimoTurn(
      sessionId, lang, spoken,
      setting ? [{ tool: "set_presentation", args: { setting, value: v }, ok: true }] : [],
      "happy", startedAt, "tap", "ok", { ttsMs },
    );
    this.persist(sessionId);
  }

  /** The prompt as a fresh default-rider turn would carry it (console popup). */
  currentSystemPrompt(): string {
    return buildSystemPrompt(
      this.personas.get("default"),
      this.operatorConfig.get().agent.systemPrompt,
      this.operatorConfig.get().tts.voices,
      journeyLine(this.telemetry.get(), "de"),
    );
  }

  /** Console "Testen": one short generation on the live route, no seat. */
  async testLlm(): Promise<LlmTestResult> {
    const cfg = this.operatorConfig.get().llm;
    const t0 = Date.now();
    try {
      const provider = await this.llm.current();
      if (!provider) return { ok: false, provider: cfg.provider, model: cfg.model, ms: Date.now() - t0, error: "kein LLM erreichbar (Canned-Modus)" };
      const turn = provider.startTurn(this.currentSystemPrompt(), "Kurzer Funktionstest: antworte in einem Satz, dass du bereit bist.", AbortSignal.timeout(20_000));
      let text = "";
      await turn.step((d) => { text += d; });
      const ms = Date.now() - t0;
      const info = this.llm.onFallback ? { provider: cfg.fallback?.provider ?? cfg.provider, model: cfg.fallback?.model ?? cfg.model } : { provider: cfg.provider, model: cfg.model };
      logger.log("llm.step", { step: 0, chars: text.length, toolCalls: [], durationMs: ms, finish: "console-test" }, { level: "debug" });
      return { ok: text.trim().length > 0, ...info, ms, text: text.trim() || undefined, error: text.trim() ? undefined : "leere Antwort" };
    } catch (err) {
      return { ok: false, provider: cfg.provider, model: cfg.model, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** ↻ — say the last reply again, no LLM round. */
  async repeatLast(input: { sessionId: string; lang: Locale; persona: PersonaKey }): Promise<void> {
    const { sessionId, lang, persona } = input;
    const text = this.hub.lastReplyOf(sessionId);
    if (!text.trim()) return;
    const turnNo = this.hub.beginTurn(sessionId);
    this.emitFullReply(sessionId, text, turnNo);
    await this.speak(sessionId, text, lang, persona, turnNo);
  }

  /** Card-bound riders keep their settings; the shared default never does. */
  private persistAccommodations(persona: PersonaKey, acc: Accommodations): void {
    if (!this.personas.isPersistable(persona)) return;
    this.personas.setAccommodationsLocal(persona, acc);
    void this.profiles.saveAccommodations(persona, acc);
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
    actions: TurnAction[],
    faceEmotion: ExpressiveEmotion,
    startedAt: number,
    modality: Modality,
    outcome: TurnOutcome,
    extra: {
      sttMs?: number;
      llmMs?: number;
      ttsMs?: number;
      llm?: { provider: string; model: string };
      error?: string;
    } = {},
  ): void {
    const latencyMs = Date.now() - startedAt;
    const timings = {
      ...(extra.sttMs != null ? { sttMs: extra.sttMs } : {}),
      ...(extra.llmMs != null ? { llmMs: extra.llmMs } : {}),
      ...(extra.ttsMs != null ? { ttsMs: extra.ttsMs } : {}),
    };
    // The last non-emotion action keeps the deprecated single field alive.
    const lastAction = [...actions].reverse().find((a) => a.tool !== "set_emotion");
    const rec = this.recorder.get(sessionId);
    this.recorder.addTurn(sessionId, {
      role: "cosimo",
      modality,
      lang,
      transcript,
      action: lastAction,
      actions,
      faceEmotion,
      latencyMs,
      outcome,
      ...(extra.llm ? { llm: extra.llm } : {}),
      timings,
      ...(extra.error ? { error: extra.error } : {}),
      at: new Date().toISOString(),
    });
    logger.log(
      "turn.end",
      {
        outcome,
        reply: transcript,
        emotion: faceEmotion,
        latencyMs,
        timings,
        tools: actions.length,
        ...(extra.error ? { error: extra.error } : {}),
      },
      {
        deviceId: rec?.deviceId,
        sessionId,
        turn: this.hub.currentTurn(sessionId),
        level: outcome === "error" ? "error" : outcome === "ok" ? "info" : "warn",
      },
    );
  }
}
