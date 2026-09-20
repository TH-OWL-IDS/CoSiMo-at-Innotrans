import { SURVEY_TOKEN_HEADER, type SurveySubmission } from "@cosimo/shared";
import { KEYS, read, rotateResponseId, write } from "./storage";

/**
 * The two calls to the CMS, same-origin (Vite proxy in dev, nginx in prod):
 * the start token when the page opens, the submission at the end.
 */

/** Fetch a start token once per tab; reuse it across reloads so a reload
 *  does not restart the timer. Never throws — no token just means `suspect`. */
export async function ensureStartToken(): Promise<string | null> {
  const have = read(KEYS.token);
  if (have) return have;
  try {
    const res = await fetch("/api/survey-start", { cache: "no-store" });
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token?: string };
    if (typeof token === "string" && token) {
      write(KEYS.token, token);
      return token;
    }
  } catch {
    // offline right now — the submit will go without a token
  }
  return null;
}

export type SubmitResult = { ok: true } | { ok: false; kind: "network" | "rejected"; detail?: string };

/**
 * POST the submission. A duplicate responseId (the tab already submitted
 * once and the marker got lost) rotates the id and retries once. Network
 * failure → "network" (the caller keeps the draft and retries); anything
 * else the server refused → "rejected".
 */
export async function submitSurvey(body: SurveySubmission, token: string | null, attempt = 0): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch("/api/survey-responses", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { [SURVEY_TOKEN_HEADER]: token } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, kind: "network" };
  }
  if (res.ok) return { ok: true };
  let detail = "";
  try {
    const j = (await res.json()) as { errors?: { message?: string }[]; message?: string };
    detail = j.errors?.map((e) => e.message ?? "").join(" ") || j.message || "";
  } catch {
    // no body
  }
  const duplicate = res.status === 400 && /responseId|unique|duplicate|bereits/i.test(detail);
  if (duplicate && attempt === 0) {
    const fresh = rotateResponseId();
    return submitSurvey({ ...body, responseId: fresh }, token, 1);
  }
  if (res.status >= 500 || res.status === 502 || res.status === 503 || res.status === 504) return { ok: false, kind: "network", detail };
  return { ok: false, kind: "rejected", detail: detail || `HTTP ${res.status}` };
}
