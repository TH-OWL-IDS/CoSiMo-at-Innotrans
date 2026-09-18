import type { PayloadRequest } from "payload";

/** The realtime service authenticates with the shared internal key (personas, sessions, the config globals). */
export function isInternal(req: PayloadRequest): boolean {
  const expected = process.env.PAYLOAD_INTERNAL_KEY;
  if (!expected) return false;
  return req.headers?.get("x-internal-key") === expected;
}
