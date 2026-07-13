/**
 * Turn recorder — accumulates the structured conversation log per session.
 * Phase 1 keeps sessions in memory and exposes them; Phase 6 persists finalized
 * sessions into Payload's `sessions` collection (structured turns only, never
 * audio). The interface is stable so the persistence swap is local.
 */

import type { PersonaKey, SessionRecord, Turn } from "@cosimo/shared";

/** Hard cap per session — a runaway client once produced 200k+ turns in one
 *  session, ballooning memory and the CMS doc. Oldest turns roll off. */
const MAX_TURNS = 500;

export class SessionRecorder {
  private readonly sessions = new Map<string, SessionRecord>();

  start(sessionId: string, deviceId: string, persona: PersonaKey, consent: boolean): void {
    if (this.sessions.has(sessionId)) return;
    this.sessions.set(sessionId, {
      sessionId,
      deviceId,
      persona,
      consent,
      startedAt: new Date().toISOString(),
      turns: [],
    });
  }

  /** Append a turn. No-op if the session never started (defensive). */
  addTurn(sessionId: string, turn: Turn): void {
    const rec = this.sessions.get(sessionId);
    if (!rec) return;
    rec.turns.push(turn);
    if (rec.turns.length > MAX_TURNS) rec.turns.splice(0, rec.turns.length - MAX_TURNS);
  }

  end(sessionId: string): SessionRecord | undefined {
    const rec = this.sessions.get(sessionId);
    if (!rec) return undefined;
    rec.endedAt = new Date().toISOString();
    // Phase 6: POST rec to Payload's /api/sessions here.
    return rec;
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }
}
