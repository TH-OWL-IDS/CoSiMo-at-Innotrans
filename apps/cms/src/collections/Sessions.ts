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
      name: "persona",
      type: "select",
      admin: { readOnly: true },
      options: ["default", "eyes-free", "wheelchair", "text-first"],
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
        { name: "outcome", type: "select", options: ["ok", "not_understood", "error", "offline_canned"] },
        { name: "action", type: "json" },
        { name: "at", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
  ],
};
