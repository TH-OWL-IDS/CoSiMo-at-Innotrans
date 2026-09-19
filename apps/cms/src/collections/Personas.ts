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
            data.traits = source.traits;
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
      name: "traits",
      type: "group",
      label: "Interaktion",
      admin: {
        description:
          "Wie diese Person mit CoSiMo umgehen möchte — sechs Achsen, aus denen der Prompt-Abschnitt erzeugt wird und die Verhalten steuern (Bestätigungen, Begrüßung, Karten). Beschreibt die Interaktion, nie die Person.",
      },
      fields: [
        {
          type: "row",
          fields: [
            { name: "modality", type: "select", label: "Kanal", defaultValue: "balanced", options: [
              { label: "Hören & Tasten (audio-first)", value: "audio-first" },
              { label: "Sehen & Lesen (visual-first)", value: "visual-first" },
              { label: "Ausgewogen", value: "balanced" },
            ] },
            { name: "pace", type: "select", label: "Tempo", defaultValue: "normal", options: [
              { label: "Schritt für Schritt", value: "step-by-step" },
              { label: "Normal", value: "normal" },
              { label: "Zügig", value: "brisk" },
            ] },
            { name: "verbosity", type: "select", label: "Ausführlichkeit", defaultValue: "normal", options: [
              { label: "Knapp", value: "terse" },
              { label: "Normal", value: "normal" },
              { label: "Erklärend", value: "explanatory" },
            ] },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "confirmation", type: "select", label: "Bestätigung", defaultValue: "result-only", options: [
              { label: "Nach jedem Schritt", value: "every-step" },
              { label: "Nur Ergebnis", value: "result-only" },
            ] },
            { name: "initiative", type: "select", label: "Initiative", defaultValue: "responds", options: [
              { label: "CoSiMo führt", value: "leads" },
              { label: "CoSiMo reagiert", value: "responds" },
            ] },
            { name: "scope", type: "select", label: "Umfang", defaultValue: "full", options: [
              { label: "Nur Basisfunktionen", value: "basics" },
              { label: "Alles", value: "full" },
            ] },
          ],
        },
      ],
    },
    {
      name: "brief",
      type: "textarea",
      required: false,
      admin: {
        description:
          "Optionaler Freitext, der die Interaktions-Achsen ergänzt (wörtlich im Prompt, nach dem erzeugten Abschnitt). Leer lassen ist völlig okay.",
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
              label: "Farbe",
              defaultValue: "weiss",
              admin: { description: "Farbschema: weiss · dunkel · blau · gruen · gelb · rosa · grau (per Sprache: „stell auf grün“)." },
            },
            {
              name: "character",
              type: "select",
              defaultValue: "face",
              label: "Gestalt",
              admin: { description: "Was im Kreis erscheint: das Gesicht oder eine der abstrakten Kritzel-Gestalten (gleiche Emotionen, eigenes Rig)." },
              options: [
                { label: "Gesicht", value: "face" },
                { label: "Knäuel", value: "blob" },
                { label: "Kreis", value: "circle" },
                { label: "Linie", value: "line" },
              ],
            },
            {
              name: "textSize",
              type: "select",
              defaultValue: "l",
              admin: { description: "L ist die größte Schrift, die der Schlitz fasst (Standard); M und S sind kleiner." },
              options: [
                { label: "S", value: "s" },
                { label: "M", value: "m" },
                { label: "L", value: "l" },
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
        {
          type: "row",
          fields: [
            {
              name: "volume",
              type: "number",
              min: 0,
              max: 1,
              defaultValue: 1,
              admin: { description: "Wiedergabe-Lautstärke (0–1), am Kiosk angewendet." },
            },
            {
              name: "voiceGender",
              type: "select",
              defaultValue: "female",
              admin: { description: "Welche der konfigurierten Stimmen spricht (Voice-IDs: Operator-Config → TTS)." },
              options: [
                { label: "Weiblich", value: "female" },
                { label: "Männlich", value: "male" },
              ],
            },
            {
              name: "voice",
              type: "text",
              admin: { description: "Stimm-Key aus dem Katalog (Operator-Config → TTS → Stimmen); leer = Gender-Standard." },
            },
            {
              name: "voiceTone",
              type: "select",
              defaultValue: "neutral",
              admin: { description: "Stimm-Charakter („freundlicher“ → warm); serverseitig auf ElevenLabs-stability gemappt." },
              options: [
                { label: "Neutral", value: "neutral" },
                { label: "Warm", value: "warm" },
                { label: "Ruhig", value: "ruhig" },
                { label: "Lebhaft", value: "lebhaft" },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "consent",
      type: "checkbox",
      label: "Einwilligung gespeichert",
      defaultValue: false,
      admin: {
        description:
          "Diese Person hat der Aufzeichnung ihrer Sessions zugestimmt — gilt bei jedem Login, ohne erneute Abfrage. Von CoSiMo gesetzt, wenn die Person am Kiosk zustimmt; hier widerrufbar.",
      },
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
