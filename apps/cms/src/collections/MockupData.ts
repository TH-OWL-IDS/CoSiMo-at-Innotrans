import type { CollectionConfig } from "payload";

/**
 * MockupData — hand-authored MonoCab telemetry snapshots. CoSiMo's answer
 * source for "how fast / where / when do we arrive" and the on-screen telemetry
 * display. No real MonoCab integration (out of scope). Mirrors the
 * `MonoCabTelemetry` type in @cosimo/shared.
 *
 * Multiple snapshots can be authored; one is marked `active` to drive the demo.
 */
export const MockupData: CollectionConfig = {
  slug: "mockup-data",
  admin: {
    useAsTitle: "name",
    group: "Content",
    description: "MonoCab telemetry scenarios CoSiMo answers from.",
  },
  access: {
    // Non-sensitive demo config — the realtime service reads it anonymously.
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "active",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Use this snapshot as the live demo telemetry." },
    },
    {
      type: "row",
      fields: [
        { name: "speedKmh", type: "number", required: true, defaultValue: 0 },
        { name: "batteryPct", type: "number", min: 0, max: 100, defaultValue: 100 },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "occupancy", type: "number", defaultValue: 0 },
        { name: "capacity", type: "number", defaultValue: 4 },
        { name: "doorsOpen", type: "checkbox", defaultValue: false },
      ],
    },
    {
      type: "collapsible",
      label: "Location & route (DE / EN)",
      fields: [
        {
          type: "row",
          fields: [
            { name: "locationDe", type: "text", label: "Location (DE)" },
            { name: "locationEn", type: "text", label: "Location (EN)" },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "lineDe", type: "text", label: "Line (DE)" },
            { name: "lineEn", type: "text", label: "Line (EN)" },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "destinationDe", type: "text", label: "Destination (DE)" },
            { name: "destinationEn", type: "text", label: "Destination (EN)" },
          ],
        },
      ],
    },
    {
      name: "nextStops",
      type: "array",
      label: "Next stops (in order)",
      fields: [
        { name: "id", type: "text", required: true },
        {
          type: "row",
          fields: [
            { name: "nameDe", type: "text", required: true, label: "Name (DE)" },
            { name: "nameEn", type: "text", required: true, label: "Name (EN)" },
          ],
        },
        { name: "etaMinutes", type: "number", required: true },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "notesDe", type: "textarea", label: "Notes (DE)" },
        { name: "notesEn", type: "textarea", label: "Notes (EN)" },
      ],
    },
  ],
};
