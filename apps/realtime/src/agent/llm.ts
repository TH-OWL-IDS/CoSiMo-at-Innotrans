import type { LlmGeneration } from "@cosimo/shared";
/**
 * LLM adapter layer. The agent loop speaks one neutral interface (start a
 * turn, stream a step, feed tool results back); the two implementations are
 * the Anthropic SDK (base URL overridable) and any OpenAI-compatible
 * chat/completions endpoint (DGX-hosted vLLM/TGI). Which one runs — and
 * against which URL/model — comes from the operator-config global, so it can
 * be switched live in the Payload admin.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { type LlmProviderKind, type OperatorConfigProvider, DEFAULT_GENERATION } from "./operatorConfig.js";

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface StepOptions {
  /** Force this tool on the step (tool_choice) — see memoryTriggers.ts. */
  forceTool?: string;
  /** No tools on this step: the model has to answer in words (after it
   *  repeated a tool call it had already made in this reply). */
  noTools?: boolean;
}

export interface LlmTurn {
  /** Run one assistant step, streaming text deltas. Empty toolCalls = done.
   *  `finish` is the provider's stop reason (logged; "length" = truncated). */
  step(onText: (delta: string) => void, opts?: StepOptions): Promise<{ toolCalls: LlmToolCall[]; finish?: string }>;
  /** Feed the executed tool results back before the next step. */
  addToolResults(results: { id: string; text: string }[]): void;
  /** Drop the last assistant message (a degenerate sample being retried). */
  retractLastAssistant(): void;
}

/** A tool call CoSiMo made in an earlier turn, replayed as it happened. */
export interface LlmHistoryAction {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: string;
}

/**
 * One earlier message of this seat's conversation, replayed for context.
 * Assistant turns carry the tool calls they made: replaying only the text
 * ("Erledigt, das Licht ist an.") teaches the model that actions are done
 * by *saying* so — measured on the GX10: tool call rate 1/18 with text-only
 * history vs 18/18 with the calls included.
 */
export interface LlmHistoryMessage {
  role: "user" | "assistant";
  text: string;
  actions?: LlmHistoryAction[];
}

export interface LlmProvider {
  readonly kind: "anthropic" | "openai-compatible";
  readonly model: string;
  /** Cheap reachability check (no generation). Anthropic: assumed reachable
   *  when the network is — its API has no free probe worth the call. */
  probe(): Promise<boolean>;
  /** `signal` aborts the streamed generation mid-turn (rider barge-in).
   *  `history` is the seat's earlier conversation (see agent.ts) — without it
   *  CoSiMo could not answer "say that again" or any follow-up. */
  startTurn(
    system: string,
    userText: string,
    signal?: AbortSignal,
    history?: LlmHistoryMessage[],
  ): LlmTurn;
}

/**
 * Normalize replayed history into what both APIs accept: drop empty texts
 * (an interrupted turn can record none), merge consecutive same-role messages,
 * and start on a user message. Partial/interrupted replies stay in — the rider
 * heard them, so CoSiMo should know it said them.
 */
export function normalizeHistory(history: LlmHistoryMessage[]): LlmHistoryMessage[] {
  const out: LlmHistoryMessage[] = [];
  for (const m of history) {
    const text = m.text.trim();
    const actions = m.actions?.length ? m.actions : undefined;
    if (!text && !actions) continue;
    const last = out[out.length - 1];
    // Plain text of the same role merges; a turn with tool calls stays whole.
    if (last && last.role === m.role && !last.actions && !actions) last.text = `${last.text}\n${text}`;
    else out.push({ role: m.role, text, ...(actions ? { actions } : {}) });
  }
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

/** Anthropic: a history entry → its message(s), tool_use/tool_result included. */
function toAnthropicMessages(m: LlmHistoryMessage): Anthropic.MessageParam[] {
  if (m.role === "user" || !m.actions) return [{ role: m.role, content: m.text }];
  const out: Anthropic.MessageParam[] = [
    {
      role: "assistant",
      content: m.actions.map((a) => ({ type: "tool_use" as const, id: a.id, name: a.name, input: a.args })),
    },
    {
      role: "user",
      content: m.actions.map((a) => ({ type: "tool_result" as const, tool_use_id: a.id, content: a.result })),
    },
  ];
  if (m.text) out.push({ role: "assistant", content: m.text });
  return out;
}

/* ---------- Anthropic ---------- */

class AnthropicTurn implements LlmTurn {
  private readonly messages: Anthropic.MessageParam[];
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly gen: LlmGeneration,
    private readonly system: string,
    userText: string,
    private readonly signal?: AbortSignal,
    history: LlmHistoryMessage[] = [],
  ) {
    this.messages = [
      ...normalizeHistory(history).flatMap(toAnthropicMessages),
      { role: "user", content: userText },
    ];
  }

  async step(onText: (delta: string) => void, opts?: StepOptions): Promise<{ toolCalls: LlmToolCall[]; finish?: string }> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: this.gen.maxTokens,
        temperature: this.gen.temperature,
        // A forced tool is incompatible with thinking on this API.
        ...(opts?.forceTool ? {} : { thinking: { type: "adaptive" as const } }),
        system: this.system,
        tools: TOOL_DEFINITIONS,
        ...(opts?.forceTool ? { tool_choice: { type: "tool" as const, name: opts.forceTool } } : opts?.noTools ? { tool_choice: { type: "none" as const } } : {}),
        messages: this.messages,
      },
      // Barge-in: aborting kills the HTTP stream mid-generation.
      this.signal ? { signal: this.signal } : undefined,
    );
    stream.on("text", onText);
    const message = await stream.finalMessage();
    this.messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason !== "tool_use") return { toolCalls: [], finish: message.stop_reason ?? undefined };
    const toolCalls: LlmToolCall[] = [];
    for (const block of message.content) {
      if (block.type !== "tool_use") continue;
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: (block.input ?? {}) as Record<string, unknown>,
      });
    }
    return { toolCalls, finish: "tool_use" };
  }

  retractLastAssistant(): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.role === "assistant") this.messages.pop();
  }

  addToolResults(results: { id: string; text: string }[]): void {
    this.messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.text,
      })),
    });
  }
}

class AnthropicProvider implements LlmProvider {
  readonly kind = "anthropic" as const;
  private readonly client: Anthropic;
  constructor(
    readonly model: string,
    private readonly gen: LlmGeneration = DEFAULT_GENERATION,
    baseUrl: string,
  ) {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }
  startTurn(
    system: string,
    userText: string,
    signal?: AbortSignal,
    history?: LlmHistoryMessage[],
  ): LlmTurn {
    return new AnthropicTurn(this.client, this.model, this.gen, system, userText, signal, history);
  }
  async probe(): Promise<boolean> {
    return true;
  }
}

/* ---------- OpenAI-compatible (DGX / vLLM / TGI) ---------- */

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

/** OpenAI-compatible: a history entry → its message(s), tool calls + results included. */
function toOpenAiMessages(m: LlmHistoryMessage): OpenAiMessage[] {
  if (m.role === "user" || !m.actions) return [{ role: m.role, content: m.text }];
  const out: OpenAiMessage[] = [
    {
      role: "assistant",
      content: null,
      tool_calls: m.actions.map((a) => ({
        id: a.id,
        type: "function" as const,
        function: { name: a.name, arguments: JSON.stringify(a.args) },
      })),
    },
    ...m.actions.map((a) => ({ role: "tool" as const, tool_call_id: a.id, content: a.result })),
  ];
  if (m.text) out.push({ role: "assistant", content: m.text });
  return out;
}

/** Anthropic tool defs → OpenAI function-calling schema. */
const OPENAI_TOOLS = TOOL_DEFINITIONS.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description ?? "",
    parameters: t.input_schema as Record<string, unknown>,
  },
}));

class OpenAiCompatTurn implements LlmTurn {
  private readonly messages: OpenAiMessage[];
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly gen: LlmGeneration,
    system: string,
    userText: string,
    private readonly signal?: AbortSignal,
    history: LlmHistoryMessage[] = [],
  ) {
    this.messages = [
      { role: "system", content: system },
      ...normalizeHistory(history).flatMap(toOpenAiMessages),
      { role: "user", content: userText },
    ];
  }

  async step(onText: (delta: string) => void, opts?: StepOptions): Promise<{ toolCalls: LlmToolCall[]; finish?: string }> {
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.gen.maxTokens,
        temperature: this.gen.temperature,
        top_p: this.gen.topP,
        // vLLM extras: ignored by strict OpenAI servers, honoured by vLLM
        repetition_penalty: this.gen.repetitionPenalty,
        chat_template_kwargs: { enable_thinking: this.gen.thinking },
        stream: true,
        messages: this.messages,
        tools: OPENAI_TOOLS,
        ...(opts?.forceTool ? { tool_choice: { type: "function", function: { name: opts.forceTool } } } : opts?.noTools ? { tool_choice: "none" } : {}),
      }),
      // Timeout + barge-in: either aborts the fetch/stream.
      signal: this.signal
        ? AbortSignal.any([AbortSignal.timeout(60_000), this.signal])
        : AbortSignal.timeout(60_000),
    });
    if (!res.ok || !res.body) {
      // The body says WHY (a rejected message shape, a bad tool call…) —
      // "llm 400" alone cost an evening once.
      const body = await res.text().catch(() => "");
      throw new Error(`llm ${res.status}: ${body.slice(0, 300)}`);
    }

    let content = "";
    let finish: string | undefined;
    // Streamed tool calls arrive as fragments keyed by index.
    const calls = new Map<number, { id: string; name: string; args: string }>();

    // Minimal SSE reader for the chat/completions stream.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (!data || data === "[DONE]") continue;
        let chunk: {
          choices?: {
            finish_reason?: string | null;
            delta?: {
              content?: string | null;
              tool_calls?: {
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }[];
            };
          }[];
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue; // tolerate keep-alives / partial junk
        }
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) finish = choice.finish_reason;
        const delta = choice?.delta;
        if (!delta) continue;
        if (delta.content) {
          content += delta.content;
          onText(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(tc.index, cur);
        }
      }
    }

    const toolCalls: LlmToolCall[] = [];
    const assistant: OpenAiMessage = { role: "assistant", content: content || null };
    if (calls.size > 0) {
      assistant.tool_calls = [];
      for (const [i, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
        const id = c.id || `call_${i}`;
        assistant.tool_calls.push({
          id,
          type: "function",
          function: { name: c.name, arguments: c.args || "{}" },
        });
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(c.args || "{}") as Record<string, unknown>;
        } catch {
          // unparseable arguments — run the tool with no input
        }
        toolCalls.push({ id, name: c.name, input });
      }
    }
    this.messages.push(assistant);
    return { toolCalls, finish };
  }

  addToolResults(results: { id: string; text: string }[]): void {
    for (const r of results) {
      this.messages.push({ role: "tool", tool_call_id: r.id, content: r.text });
    }
  }

  retractLastAssistant(): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.role === "assistant") this.messages.pop();
  }
}

class OpenAiCompatProvider implements LlmProvider {
  readonly kind = "openai-compatible" as const;
  constructor(
    readonly model: string,
    private readonly gen: LlmGeneration = DEFAULT_GENERATION,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}
  /** GET /models — every OpenAI-compatible server answers it, vLLM included. */
  async probe(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        signal: AbortSignal.timeout(4000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  startTurn(
    system: string,
    userText: string,
    signal?: AbortSignal,
    history?: LlmHistoryMessage[],
  ): LlmTurn {
    return new OpenAiCompatTurn(
      this.baseUrl, this.apiKey, this.model, this.gen, system, userText, signal, history,
    );
  }
}

/* ---------- router ---------- */

/**
 * Resolves the active provider from the (TTL-cached) operator config each
 * turn, rebuilding the underlying client only when the routing actually
 * changed. Returns null when the selected provider is unusable (missing key
 * or URL) — the agent then serves canned replies.
 */
export class LlmRouter {
  private cached: LlmProvider | null = null;
  private cacheKey = "";
  private cachedFallback: LlmProvider | null = null;
  private fallbackKey = "";
  /** Last probe verdict for the primary; true until a probe says otherwise. */
  private primaryReachable = true;

  constructor(private readonly operatorConfig: OperatorConfigProvider) {}

  /** Best-effort answer without a fetch (used at boot for the status flag). */
  maybeConfigured(): boolean {
    return this.build(this.operatorConfig.get().llm) !== null;
  }

  /** The provider a turn should use right now: the primary, or the fallback
   *  while the primary is unreachable, or null (→ canned). */
  async current(): Promise<LlmProvider | null> {
    const { llm } = await this.operatorConfig.refresh();
    const key = `${llm.provider}|${llm.baseUrl}|${llm.model}|${JSON.stringify(llm.generation)}`;
    if (key !== this.cacheKey) {
      this.cached = this.build(llm, llm.generation);
      this.cacheKey = key;
      this.primaryReachable = true; // a new endpoint gets the benefit of the doubt
    }
    const fb = llm.fallback;
    const fbKey = fb ? `${fb.provider}|${fb.baseUrl}|${fb.model}|${JSON.stringify(llm.generation)}` : "";
    if (fbKey !== this.fallbackKey) {
      this.cachedFallback = fb ? this.build(fb, llm.generation) : null;
      this.fallbackKey = fbKey;
    }
    if (this.cached && this.primaryReachable) return this.cached;
    return this.cachedFallback ?? this.cached;
  }

  /** True while a turn would run on the fallback rather than the primary. */
  get onFallback(): boolean {
    return !this.primaryReachable && this.cachedFallback !== null;
  }

  /**
   * Probe the primary (health monitor, every few seconds). Returns whether a
   * brain is reachable at all: primary, or — if it is down — the fallback.
   * Never throws.
   */
  async probe(): Promise<{ primary: boolean; reachable: boolean }> {
    try {
      await this.current();
      const primary = this.cached ? await this.cached.probe() : false;
      this.primaryReachable = primary;
      if (primary) return { primary: true, reachable: true };
      const fallback = this.cachedFallback ? await this.cachedFallback.probe() : false;
      return { primary: false, reachable: fallback };
    } catch {
      return { primary: false, reachable: false };
    }
  }

  private build(llm: { provider: LlmProviderKind; baseUrl: string; model: string }, gen: LlmGeneration = DEFAULT_GENERATION): LlmProvider | null {
    if (llm.provider === "openai-compatible") {
      return llm.baseUrl
        ? new OpenAiCompatProvider(llm.model, gen, llm.baseUrl, config.llm.apiKey)
        : null;
    }
    return config.anthropic.apiKey ? new AnthropicProvider(llm.model, gen, llm.baseUrl) : null;
  }
}
