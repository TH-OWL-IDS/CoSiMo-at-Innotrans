import type { CollectionConfig } from "payload";

/**
 * Personas — hand-authored visitor types CoSiMo adapts to. Shapes both the
 * system prompt (support style) and the Face/UI (emotional bias, theme).
 * Mirrors the `Persona` type in @cosimo/shared.
 */
export const Personas: CollectionConfig = {
  slug: "personas",
  admin: {
    useAsTitle: "key",
    group: "Content",
    description: "Visitor support profiles that change how CoSiMo responds.",
  },
  access: {
    // Non-sensitive demo config — the realtime service reads it anonymously.
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
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
      name: "key",
      type: "select",
      required: true,
      unique: true,
      options: [
        { label: "Default", value: "default" },
        { label: "Eyes-free / visually impaired", value: "eyes-free" },
        { label: "Wheelchair user", value: "wheelchair" },
        { label: "Text-first / deaf", value: "text-first" },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "labelDe", type: "text", required: true, label: "Label (DE)" },
        { name: "labelEn", type: "text", required: true, label: "Label (EN)" },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "summaryDe", type: "textarea", label: "Summary (DE)" },
        { name: "summaryEn", type: "textarea", label: "Summary (EN)" },
      ],
    },
    {
      name: "supportStyle",
      type: "textarea",
      required: true,
      admin: {
        description:
          "Injected into CoSiMo's system prompt to shape how it supports this visitor.",
      },
    },
    {
      name: "preferredModality",
      type: "select",
      defaultValue: "both",
      options: [
        { label: "Voice", value: "voice" },
        { label: "Text", value: "text" },
        { label: "Both", value: "both" },
      ],
    },
    {
      name: "themeId",
      type: "text",
      defaultValue: "classic",
      admin: { description: "Appearance scheme id (ported from CoSiMo-mockup)." },
    },
    {
      name: "emotionBias",
      type: "group",
      admin: { description: "Bias toward expressive emotions, 0..1." },
      fields: [
        { name: "happy", type: "number", min: 0, max: 1, defaultValue: 0 },
        { name: "sad", type: "number", min: 0, max: 1, defaultValue: 0 },
        { name: "surprised", type: "number", min: 0, max: 1, defaultValue: 0 },
        { name: "neutral", type: "number", min: 0, max: 1, defaultValue: 0 },
      ],
    },
    {
      name: "presentation",
      type: "group",
      fields: [
        { name: "highContrast", type: "checkbox", defaultValue: false },
        { name: "largeText", type: "checkbox", defaultValue: false },
        { name: "speakAloud", type: "checkbox", defaultValue: true },
      ],
    },
  ],
};
