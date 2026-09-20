/**
 * Per-tab state in sessionStorage (decided 2026-09-20: one submission per
 * browser session — a new QR scan is a new tab and a new chance; the
 * server's unique responseId is the real duplicate guard). Every access is
 * wrapped: Lockdown Mode, "block all cookies" and some in-app browsers
 * throw, and the page must still work then — with an in-memory fallback.
 */

const memory = new Map<string, string>();

function store(): Storage | null {
  try {
    const s = window.sessionStorage;
    s.setItem("cosimo.form.probe", "1");
    s.removeItem("cosimo.form.probe");
    return s;
  } catch {
    return null;
  }
}

export function read(key: string): string | null {
  try {
    return store()?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    store()?.setItem(key, value);
  } catch {
    // memory has it
  }
}

export function remove(key: string): void {
  memory.delete(key);
  try {
    store()?.removeItem(key);
  } catch {
    // fine
  }
}

export const KEYS = {
  responseId: "cosimo.form.responseId",
  done: "cosimo.form.done",
  draft: "cosimo.form.draft",
  startedAt: "cosimo.form.startedAt",
  token: "cosimo.form.token",
} as const;

/** A random id, 22 chars base64url. `crypto.randomUUID` is undefined on a
 *  plain-http LAN origin (the first thing one hits testing on a phone). */
export function randomId(): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }
}

/** The tab's responseId — minted once, reused on reload. */
export function responseId(): string {
  let id = read(KEYS.responseId);
  if (!id) {
    id = randomId();
    write(KEYS.responseId, id);
  }
  return id;
}

/** A fresh responseId (after a duplicate rejection). */
export function rotateResponseId(): string {
  const id = randomId();
  write(KEYS.responseId, id);
  return id;
}
