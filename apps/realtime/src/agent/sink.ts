/**
 * Persists recorded sessions into Payload's `sessions` collection — the research
 * dataset. Server-to-server writes are authorized with a shared internal key.
 *
 * GDPR: only sessions where the visitor consented are written. Declined
 * sessions are never persisted (the conversation still happens, it just leaves
 * no record). Writes are best-effort and upsert incrementally per turn so even
 * abandoned conversations are captured.
 */

import type { SessionRecord, Turn } from "@cosimo/shared";
import { config } from "../config.js";

/** Map our Turn to the Payload `turns` array row (field names match the schema). */
function toTurnRow(t: Turn): Record<string, unknown> {
  return {
    role: t.role,
    modality: t.modality,
    lang: t.lang,
    transcript: t.transcript,
    detectedIntent: t.detectedIntent,
    faceEmotion: t.faceEmotion,
    latencyMs: t.latencyMs,
    outcome: t.outcome,
    action: t.action ?? undefined,
    actions: t.actions ?? undefined,
    llm: t.llm ?? undefined,
    timings: t.timings ?? undefined,
    error: t.error ?? undefined,
    at: t.at,
  };
}

function toDoc(rec: SessionRecord): Record<string, unknown> {
  return {
    sessionId: rec.sessionId,
    deviceId: rec.deviceId,
    persona: rec.persona,
    consent: rec.consent,
    startedAt: rec.startedAt,
    endedAt: rec.endedAt,
    turns: rec.turns.map(toTurnRow),
  };
}

export class PayloadSink {
  private readonly base: string;
  private readonly key: string;
  /** sessionId → Payload document id, to choose update vs create. */
  private readonly ids = new Map<string, string>();

  constructor() {
    this.base = config.payload.internalUrl.replace(/\/+$/, "");
    this.key = config.payload.internalKey;
  }

  /** True when persistence is configured (a CMS URL + internal key). */
  get enabled(): boolean {
    return Boolean(this.base && this.key);
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", "x-internal-key": this.key };
  }

  /** Upsert a consented session. No-op when disabled or consent not given. */
  async save(rec: SessionRecord): Promise<void> {
    if (!this.enabled || !rec.consent) return;
    try {
      const id = this.ids.get(rec.sessionId) ?? (await this.findId(rec.sessionId));
      const body = JSON.stringify(toDoc(rec));
      if (id) {
        await fetch(`${this.base}/api/sessions/${id}`, {
          method: "PATCH",
          headers: this.headers(),
          body,
          signal: AbortSignal.timeout(4000),
        });
        return;
      }
      const res = await fetch(`${this.base}/api/sessions`, {
        method: "POST",
        headers: this.headers(),
        body,
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const j = (await res.json()) as { doc?: { id?: string | number }; id?: string | number };
        const newId = j.doc?.id ?? j.id;
        if (newId != null) this.ids.set(rec.sessionId, String(newId));
      } else if (res.status === 400) {
        // Likely a duplicate sessionId (e.g. after a restart) — recover the id.
        const found = await this.findId(rec.sessionId);
        if (found) {
          this.ids.set(rec.sessionId, found);
          await this.save(rec);
        }
      }
    } catch {
      // Best-effort: a CMS hiccup must never break the live conversation.
    }
  }

  /** Look up an existing session doc id by sessionId. */
  private async findId(sessionId: string): Promise<string | undefined> {
    try {
      const url = `${this.base}/api/sessions?where[sessionId][equals]=${encodeURIComponent(sessionId)}&limit=1&depth=0`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(4000) });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { docs?: { id?: string | number }[] };
      const id = body.docs?.[0]?.id;
      return id != null ? String(id) : undefined;
    } catch {
      return undefined;
    }
  }
}
