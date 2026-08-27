/**
 * Writes profile changes back to Payload's `personas` collection — how CoSiMo
 * "remembers you" across visits. Server-to-server writes use the shared
 * internal key (same pattern as the sessions sink).
 *
 * Two write paths, deliberately gated differently (see plan-personas.md §9):
 *  - **accommodations** — UI preferences; persisted for any card-bound user
 *    profile (the registered card is the basis). Never a diagnosis.
 *  - **memories** — personal data; persisted only with the visitor's consent.
 *
 * Best-effort and fire-and-forget: a CMS hiccup must never break the live turn.
 */

import type { Accommodations, PersonaKey, PersonaMemory } from "@cosimo/shared";
import { config } from "../config.js";

export class ProfileSink {
  private readonly base: string;
  private readonly key: string;
  /** persona key → Payload document id, so we PATCH the right row. */
  private readonly ids = new Map<string, string>();

  constructor() {
    this.base = config.payload.internalUrl.replace(/\/+$/, "");
    this.key = config.payload.internalKey;
  }

  /** True when write-back is configured (a CMS URL + internal key). */
  get enabled(): boolean {
    return Boolean(this.base && this.key);
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", "x-internal-key": this.key };
  }

  /** Persist a user's accommodations (card-basis; no consent needed). */
  async saveAccommodations(personaKey: PersonaKey, accommodations: Accommodations): Promise<void> {
    await this.patch(personaKey, { accommodations });
  }

  /** Persist a card-bound rider's recording consent (it then applies at every login). */
  async saveConsent(personaKey: PersonaKey, consent: boolean): Promise<void> {
    await this.patch(personaKey, { consent });
  }

  /** Persist a user's memories (personal data — caller must gate on consent). */
  async saveMemories(personaKey: PersonaKey, memories: PersonaMemory[]): Promise<void> {
    await this.patch(personaKey, {
      memories: memories.map((m) => ({ note: m.note, at: m.at })),
    });
  }

  private async patch(personaKey: PersonaKey, body: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;
    try {
      const id = this.ids.get(personaKey) ?? (await this.findId(personaKey));
      if (!id) return; // unknown profile — nothing to write back to
      this.ids.set(personaKey, id);
      await fetch(`${this.base}/api/personas/${id}`, {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // Best-effort: a CMS hiccup must never break the live conversation.
    }
  }

  private async findId(personaKey: PersonaKey): Promise<string | undefined> {
    try {
      const url = `${this.base}/api/personas?where[key][equals]=${encodeURIComponent(personaKey)}&limit=1&depth=0`;
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
