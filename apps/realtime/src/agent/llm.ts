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
import type { LlmProviderKind, OperatorConfigProvider } from "./operatorConfig.js";

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmTurn {
  /** Run one assistant step, streaming text deltas. Empty toolCalls = done. */
  step(onText: (delta: string) => void): Promise<{ toolCalls: LlmToolCall[] }>;
  /** Feed the executed tool results back before the next step. */
  addToolResults(results: { id: string; text: string }[]): void;
}

/** One earlier message of this seat's conversation, replayed for context. */
export interface LlmHistoryMessage {
  role: "user" | "assistant";
  text: string;
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
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.text = `${last.text}\n${text}`;
    else out.push({ role: m.role, text });
  }
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

/* ---------- Anthropic ---------- */

class AnthropicTurn implements LlmTurn {
  private readonly messages: Anthropic.MessageParam[];
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly system: string,
    userText: string,
    private readonly signal?: AbortSignal,
    history: LlmHistoryMessage[] = [],
  ) {
    this.messages = [
      ...normalizeHistory(history).map((m) => ({
        role: m.role,
        content: m.text,
      })),
      { role: "user", content: userText },
    ];
  }

  async step(onText: (delta: string) => void): Promise<{ toolCalls: LlmToolCall[] }> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 1024,
        thinking: { type: "adaptive" },
        system: this.system,
        tools: TOOL_DEFINITIONS,
        messages: this.messages,
      },
      // Barge-in: aborting kills the HTTP stream mid-generation.
      this.signal ? { signal: this.signal } : undefined,
    );
    stream.on("text", onText);
    const message = await stream.finalMessage();
    this.messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason !== "tool_use") return { toolCalls: [] };
    const toolCalls: LlmToolCall[] = [];
    for (const block of message.content) {
      if (block.type !== "tool_use") continue;
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: (block.input ?? {}) as Record<string, unknown>,
      });
    }
    return { toolCalls };
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
    return new AnthropicTurn(this.client, this.model, system, userText, signal, history);
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
    system: string,
    userText: string,
    private readonly signal?: AbortSignal,
    history: LlmHistoryMessage[] = [],
  ) {
    this.messages = [
      { role: "system", content: system },
      ...normalizeHistory(history).map((m) => ({
        role: m.role,
        content: m.text,
      })),
      { role: "user", content: userText },
    ];
  }

  async step(onText: (delta: string) => void): Promise<{ toolCalls: LlmToolCall[] }> {
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        stream: true,
        messages: this.messages,
        tools: OPENAI_TOOLS,
      }),
      // Timeout + barge-in: either aborts the fetch/stream.
      signal: this.signal
        ? AbortSignal.any([AbortSignal.timeout(60_000), this.signal])
        : AbortSignal.timeout(60_000),
    });
    if (!res.ok || !res.body) throw new Error(`llm ${res.status}`);

    let content = "";
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
        const delta = chunk.choices?.[0]?.delta;
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
    return { toolCalls };
  }

  addToolResults(results: { id: string; text: string }[]): void {
    for (const r of results) {
      this.messages.push({ role: "tool", tool_call_id: r.id, content: r.text });
    }
  }
}

class OpenAiCompatProvider implements LlmProvider {
  readonly kind = "openai-compatible" as const;
  constructor(
    readonly model: string,
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
      this.baseUrl, this.apiKey, this.model, system, userText, signal, history,
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
    const key = `${llm.provider}|${llm.baseUrl}|${llm.model}`;
    if (key !== this.cacheKey) {
      this.cached = this.build(llm);
      this.cacheKey = key;
      this.primaryReachable = true; // a new endpoint gets the benefit of the doubt
    }
    const fb = llm.fallback;
    const fbKey = fb ? `${fb.provider}|${fb.baseUrl}|${fb.model}` : "";
    if (fbKey !== this.fallbackKey) {
      this.cachedFallback = fb ? this.build(fb) : null;
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

  private build(llm: { provider: LlmProviderKind; baseUrl: string; model: string }): LlmProvider | null {
    if (llm.provider === "openai-compatible") {
      return llm.baseUrl
        ? new OpenAiCompatProvider(llm.model, llm.baseUrl, config.llm.apiKey)
        : null;
    }
    return config.anthropic.apiKey ? new AnthropicProvider(llm.model, llm.baseUrl) : null;
  }
}
