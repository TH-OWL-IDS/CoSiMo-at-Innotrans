import type { GlobalConfig } from "payload";

/**
 * Route config — the line the journey simulation drives, editable live in the
 * admin. The realtime service reads this global on a TTL and simulates the
 * MonoCab travelling from the first stop to the last and back (ping-pong):
 * cruising between stops, dwelling with open doors, turning at the terminals.
 * Editing the route restarts the journey at the new first stop. Replaces the
 * old hand-flipped `mockup-data` telemetry snapshots.
 */
export const RouteConfig: GlobalConfig = {
  slug: "route-config",
  label: "Route (Simulation)",
  admin: {
    group: "Operations",
    description:
      "Die Strecke, die die Fahrsimulation abfährt (hin und zurück, endlos). Änderungen starten die Fahrt am ersten Halt neu.",
  },
  access: {
    // Non-sensitive demo config — the realtime service reads it anonymously.
    read: () => true,
    update: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      type: "row",
      fields: [
        { name: "lineDe", type: "text", label: "Linie (DE)", defaultValue: "Extertalbahn" },
        { name: "lineEn", type: "text", label: "Line (EN)", defaultValue: "Extertal line" },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "cruiseSpeedKmh",
          type: "number",
          min: 5,
          max: 120,
          defaultValue: 55,
          admin: { description: "Reisegeschwindigkeit zwischen den Halten." },
        },
        {
          name: "capacity",
          type: "number",
          min: 1,
          max: 12,
          defaultValue: 4,
          admin: { description: "Sitzplätze in der Kabine." },
        },
      ],
    },
    {
      name: "stops",
      type: "array",
      minRows: 2,
      admin: {
        description:
          "Halte in Fahrtrichtung. Fahrzeit = Sekunden vom vorherigen Halt hierher (beim ersten Halt ignoriert). Haltezeit = Sekunden mit offenen Türen.",
      },
      fields: [
        { name: "stopId", type: "text", required: true, label: "Stop-ID (slug)" },
        {
          type: "row",
          fields: [
            { name: "nameDe", type: "text", required: true, label: "Name (DE)" },
            { name: "nameEn", type: "text", required: true, label: "Name (EN)" },
          ],
        },
        {
          type: "row",
          fields: [
            {
              name: "travelSecondsFromPrev",
              type: "number",
              min: 0,
              defaultValue: 240,
              label: "Fahrzeit (s)",
              admin: { description: "0 beim ersten Halt (wird ignoriert)." },
            },
            { name: "dwellSeconds", type: "number", min: 5, defaultValue: 45, label: "Haltezeit (s)" },
          ],
        },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "notesDe", type: "text", label: "Hinweise (DE)" },
        { name: "notesEn", type: "text", label: "Notes (EN)" },
      ],
    },
  ],
};
