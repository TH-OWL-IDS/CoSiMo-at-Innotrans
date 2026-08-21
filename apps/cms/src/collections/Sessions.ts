import type { Access, CollectionConfig, PayloadRequest } from "payload";

/** True when the request carries the shared server-to-server internal key. */
function hasInternalKey(req: PayloadRequest): boolean {
  const expected = process.env.PAYLOAD_INTERNAL_KEY;
  if (!expected) return false;
  return req.headers?.get("x-internal-key") === expected;
}

/** The realtime service (internal key) or any logged-in operator. */
const internalOrUser: Access = ({ req }) => Boolean(req.user) || hasInternalKey(req);

/**
 * Sessions — RUNTIME-generated conversation logs written live by the realtime
 * service. This is the research dataset (structured turns only, never audio).
 *
 * In the admin this is effectively READ-ONLY: hosts browse/filter/export but do
 * not author or edit records. Writes come from the realtime service via the
 * REST/Local API; deletion is restricted to admins (data hygiene only).
 * Mirrors `SessionRecord` / `Turn` in @cosimo/shared.
 */
export const Sessions: CollectionConfig = {
  slug: "sessions",
  admin: {
    useAsTitle: "sessionId",
    group: "Research",
    description:
      "Recorded visitor conversations. Read-only research data — written by CoSiMo at runtime.",
    defaultColumns: ["sessionId", "persona", "deviceId", "consent", "startedAt"],
  },
  access: {
    // Written by the realtime service (internal key); read/exported by operators.
    create: ({ req }) => hasInternalKey(req),
    update: ({ req }) => hasInternalKey(req),
    read: internalOrUser,
    // Only admins may delete (data hygiene).
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    { name: "sessionId", type: "text", required: true, unique: true, admin: { readOnly: true } },
    { name: "deviceId", type: "text", admin: { readOnly: true } },
    {
      // Free text (not a select): personas are data-driven, so a session may
      // reference any authored persona slug. Written by the realtime service.
      name: "persona",
      type: "text",
      admin: { readOnly: true },
    },
    { name: "consent", type: "checkbox", admin: { readOnly: true } },
    {
      type: "row",
      fields: [
        { name: "startedAt", type: "date", admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } } },
        { name: "endedAt", type: "date", admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
    {
      name: "turns",
      type: "array",
      admin: { readOnly: true },
      fields: [
        { name: "role", type: "select", options: ["user", "cosimo"] },
        { name: "modality", type: "select", options: ["voice", "text"] },
        { name: "lang", type: "select", options: ["de", "en"] },
        { name: "transcript", type: "textarea" },
        { name: "detectedIntent", type: "text" },
        { name: "faceEmotion", type: "text" },
        { name: "latencyMs", type: "number" },
        { name: "outcome", type: "select", options: ["ok", "not_understood", "error", "offline_canned", "interrupted"] },
        // Deprecated: the last action only. Kept so old rows still read.
        { name: "action", type: "json", admin: { description: "Veraltet – nur der letzte Tool-Aufruf. Siehe actions." } },
        // Every tool call of the turn, in order, with input/result/ok/duration.
        { name: "actions", type: "json", admin: { description: "Alle Tool-Aufrufe des Turns (Name, Argumente, Ergebnis, ok, Dauer)." } },
        // Which brain answered, where the latency went, and why it failed.
        { name: "llm", type: "json", admin: { description: "Provider + Modell (leer bei Canned-Antworten)." } },
        { name: "timings", type: "json", admin: { description: "sttMs / llmMs / ttsMs." } },
        { name: "error", type: "text", admin: { description: "Fehlermeldung bei outcome=error." } },
        { name: "at", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
  ],
};
