import type { CollectionConfig, PayloadRequest } from "payload";

/** True when the request carries the shared server-to-server internal key. */
function hasInternalKey(req: PayloadRequest): boolean {
  const expected = process.env.PAYLOAD_INTERNAL_KEY;
  if (!expected) return false;
  return req.headers?.get("x-internal-key") === expected;
}

/**
 * Profiles — the users CoSiMo adapts to and remembers (slug kept as
 * `personas`). A profile carries identity, machine-actionable *accommodations*,
 * an operator *brief* (verbatim prompt), and CoSiMo-written *memories*.
 * `default` is the clean plate new riders are copied from. We store
 * accommodations, never diagnoses. Mirrors the `Persona` type in @cosimo/shared.
 */
export const Personas: CollectionConfig = {
  slug: "personas",
  admin: {
    useAsTitle: "key",
    group: "Content",
    defaultColumns: ["key", "name"],
    description: "Rider profiles that change how CoSiMo responds. \"default\" is the clean plate new riders are copied from.",
  },
  access: {
    // Non-sensitive demo config — the realtime service reads it anonymously.
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    // The realtime service (internal key) writes back accommodations + memories
    // when CoSiMo adapts to / remembers a rider; operators edit in the admin.
    update: ({ req }) => Boolean(req.user) || hasInternalKey(req),
    delete: ({ req }) => Boolean(req.user),
  },
  hooks: {
    // Create a new rider by copying from an existing profile (usually the
    // `default` clean plate): on create, COPY its accommodations + brief into
    // the new profile (snapshot, not a live link — later edits to the source do
    // not propagate). Runs before validation so the required `brief` is
    // satisfied by the copy. See docs/personas.md.
    beforeValidate: [
      async ({ data, operation, req }) => {
        if (!data || operation !== "create" || data.copyFrom == null) return data;
        try {
          const source = await req.payload.findByID({
            collection: "personas",
            id: data.copyFrom as number | string,
            depth: 0,
          });
          if (source) {
            data.accommodations = source.accommodations;
            if (!data.brief || !String(data.brief).trim()) data.brief = source.brief;
          }
        } catch {
          // Source gone — leave the operator's own values / validation to flag it.
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "nfcIds",
      type: "array",
      label: "NFC chips",
      admin: {
        description:
          "Chip-IDs, die dieses Profil als \"Account\" laden (NFC-Reader am Kiosk).",
      },
      fields: [{ name: "tag", type: "text", required: true, label: "Chip-ID" }],
    },
    {
      name: "name",
      type: "text",
      admin: { description: "Vorname der Person (die geteilte \"default\"-Vorlage bleibt leer)." },
    },
    {
      name: "copyFrom",
      type: "relationship",
      relationTo: "personas",
      admin: {
        description:
          "Beim Anlegen: Profil, aus dem Accommodations + Brief EINMALIG kopiert werden — üblicherweise \"default\" (die saubere Vorlage). Danach ist das neue Profil unabhängig.",
      },
    },
    {
      name: "key",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description:
          "Stabiler Slug, mit dem überall auf dieses Profil verwiesen wird (z. B. \"wheelchair\"). Kleinbuchstaben, kebab-case. Neue Personas einfach mit neuem Slug anlegen. \"default\" muss existieren – es ist der Fallback.",
      },
      validate: (val: unknown) =>
        typeof val === "string" && /^[a-z][a-z0-9-]*$/.test(val)
          ? true
          : "Slug im Format a-z, 0-9 und Bindestrich (Kleinbuchstaben, kein führender Bindestrich).",
    },
    {
      name: "label",
      type: "text",
      required: true,
      admin: {
        description:
          "Anzeigename — bei Personen der Name (keine Übersetzung nötig). Geteilte, unpersönliche Inhalte bleiben zweisprachig; Profile nicht.",
      },
    },
    {
      name: "summary",
      type: "textarea",
      admin: { description: "Kurze Beschreibung für die Operator-Konsole." },
    },
    {
      name: "brief",
      type: "textarea",
      required: true,
      admin: {
        description:
          "Operator-Prosa, wörtlich in CoSiMos System-Prompt injiziert, um zu formen, wie CoSiMo diese Person unterstützt.",
      },
    },
    {
      name: "accommodations",
      type: "group",
      admin: {
        description:
          "Deterministische UI-Hebel, die Clients anwenden — auch per Sprache über CoSiMo änderbar. Wir speichern Anpassungen, keine Diagnosen.",
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "language",
              type: "select",
              defaultValue: "de",
              admin: { description: "Bevorzugte Sprache des Fahrgasts." },
              options: [
                { label: "Deutsch", value: "de" },
                { label: "English", value: "en" },
              ],
            },
            {
              name: "theme",
              type: "text",
              defaultValue: "classic",
              admin: { description: "Appearance scheme id (packages/face)." },
            },
            {
              name: "textSize",
              type: "select",
              defaultValue: "m",
              options: [
                { label: "S", value: "s" },
                { label: "M", value: "m" },
                { label: "L", value: "l" },
                { label: "XL", value: "xl" },
              ],
            },
            {
              name: "contrast",
              type: "select",
              defaultValue: "normal",
              options: [
                { label: "Normal", value: "normal" },
                { label: "Hoch", value: "high" },
              ],
            },
            {
              name: "input",
              type: "select",
              defaultValue: "both",
              options: [
                { label: "Voice", value: "voice" },
                { label: "Text", value: "text" },
                { label: "Both", value: "both" },
              ],
            },
          ],
        },
        {
          type: "row",
          fields: [
            {
              name: "audioOutput",
              type: "checkbox",
              defaultValue: true,
              admin: { description: "Antworten vorlesen (TTS)." },
            },
            {
              name: "speechRate",
              type: "number",
              min: 0.5,
              max: 1.5,
              defaultValue: 1,
              admin: { description: "TTS-Tempo (0.5–1.5)." },
            },
            {
              name: "showText",
              type: "checkbox",
              defaultValue: false,
              admin: { description: "Antwort als Text zeigen. Standard aus (Gesicht + Stimme zuerst)." },
            },
            {
              name: "reduceMotion",
              type: "checkbox",
              defaultValue: false,
              admin: { description: "Animiertes Gesicht beruhigen (Photosensibilität/Vestibulär)." },
            },
          ],
        },
      ],
    },
    {
      name: "memories",
      type: "array",
      admin: {
        readOnly: true,
        description:
          "Notizen, die sich CoSiMo gemerkt hat (nur mit Einwilligung; von CoSiMo geschrieben).",
      },
      fields: [
        { name: "note", type: "textarea", required: true },
        { name: "at", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
  ],
};
