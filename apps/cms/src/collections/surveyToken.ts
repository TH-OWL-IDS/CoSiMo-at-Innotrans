import { createHmac, timingSafeEqual } from "node:crypto";
import type { Endpoint } from "payload";
import { SURVEY_MIN_SECONDS, SURVEY_TOKEN_MAX_AGE_SEC } from "@cosimo/shared";

/**
 * The questionnaire's honest timer. The form fetches a start token when it
 * opens (`GET /api/survey-start`); the token is the open time signed with a
 * server secret, so a client cannot claim to have taken its time. On submit
 * the collection hook reads it back: valid and old enough → fine; missing,
 * forged, too young or expired → the row is flagged `suspect`, never
 * rejected (a fast honest visitor at a fair must not lose their answers —
 * junk is filtered in the export instead).
 *
 * The secret is SURVEY_TOKEN_SECRET, falling back to PAYLOAD_SECRET so the
 * feature needs no new env to work.
 */

function secret(): string {
  return process.env.SURVEY_TOKEN_SECRET || process.env.PAYLOAD_SECRET || "dev-secret";
}

const sign = (ts: string) => createHmac("sha256", secret()).update(ts).digest("base64url");

export function issueSurveyToken(now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${sign(ts)}`;
}

export type SurveyTokenCheck =
  | { ok: true; ageSec: number }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "too-fast"; ageSec?: number };

/** Verify a token against "now"; the reason is what lands in `suspectReason`. */
export function checkSurveyToken(token: string | null | undefined, now = Date.now()): SurveyTokenCheck {
  if (!token) return { ok: false, reason: "missing" };
  const [ts, mac] = token.split(".");
  if (!ts || !mac || !/^\d{10,16}$/.test(ts)) return { ok: false, reason: "invalid" };
  const expected = sign(ts);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  const ageSec = Math.round((now - Number(ts)) / 1000);
  if (ageSec < 0 || ageSec > SURVEY_TOKEN_MAX_AGE_SEC) return { ok: false, reason: "expired", ageSec };
  if (ageSec < SURVEY_MIN_SECONDS) return { ok: false, reason: "too-fast", ageSec };
  return { ok: true, ageSec };
}

/** Root endpoint (not under the collection, so it never collides with
 *  `GET /api/survey-responses/:id`). Public by design; no state, no DB. */
export const surveyStartEndpoint: Endpoint = {
  path: "/survey-start",
  method: "get",
  handler: async () =>
    Response.json({ token: issueSurveyToken() }, { headers: { "cache-control": "no-store" } }),
};
