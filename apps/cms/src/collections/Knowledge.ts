import type { CollectionConfig } from "payload";

/**
 * What CoSiMo knows about the MonoCab and about itself: one entry per topic
 * and fact, rides the system prompt as "## Über das MonoCab und CoSiMo".
 * Facts only — the prompt tells CoSiMo to answer from these and to refer
 * to the stand's staff for anything not in here. Seeded from
 * `@cosimo/shared` knowledge.ts; empty = those defaults.
 */
export const Knowledge: CollectionConfig = {
  slug: "knowledge",
  labels: { singular: "Wissen", plural: "Wissen" },
  admin: {
    useAsTitle: "title",
    group: "Content",
    defaultColumns: ["topic", "title", "order", "active"],
    description: "Fakten über das MonoCab und über CoSiMo — CoSiMo beantwortet Fragen dazu NUR aus diesen Einträgen (und verweist sonst ans Standpersonal). Wirkt binnen 15 s.",
  },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  defaultSort: "order",
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "topic",
          type: "select",
          required: true,
          defaultValue: "monocab",
          options: [
            { label: "MonoCab", value: "monocab" },
            { label: "CoSiMo", value: "cosimo" },
          ],
          admin: { width: "30%" },
        },
        { name: "title", type: "text", required: true, label: "Titel", admin: { width: "50%", description: "Kurz, als Stichwort („Was das MonoCab ist“)." } },
        { name: "order", type: "number", defaultValue: 0, label: "Reihenfolge", admin: { width: "20%" } },
      ],
    },
    {
      name: "body",
      type: "textarea",
      required: true,
      label: "Fakten",
      admin: { rows: 4, description: "Ein bis drei Sätze, so wie CoSiMo es sagen darf. Keine Zahlen, die nicht geprüft sind." },
    },
    { name: "active", type: "checkbox", defaultValue: true, label: "Aktiv", admin: { description: "Aus = bleibt gespeichert, kommt aber nicht in den Prompt." } },
  ],
};
