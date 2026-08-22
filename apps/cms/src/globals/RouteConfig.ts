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
            {
              name: "demand",
              type: "number",
              min: 0,
              max: 5,
              defaultValue: 2,
              label: "Andrang (0–5)",
              admin: { description: "Wie viele Fahrgäste hier typischerweise zusteigen (Simulation)." },
            },
          ],
        },
      ],
    },
    {
      name: "faults",
      type: "array",
      label: "Störungs-Szenario",
      admin: {
        description:
          "Würfelt im Betrieb automatisch Störungen (für den unbeaufsichtigten Messe-Loop). Jede Regel würfelt alle N Minuten mit der angegebenen Wahrscheinlichkeit; es läuft immer nur eine Störung gleichzeitig. Der Host kann jederzeit zusätzlich eine Störung auslösen oder alle beenden.",
      },
      fields: [
        {
          name: "kind",
          type: "select",
          required: true,
          label: "Störung",
          options: [
            { label: "Halt vor Signal (Stopp zwischen Halten, Verspätung)", value: "signal-hold" },
            { label: "Türstörung (Türen bleiben offen, längerer Halt)", value: "door-fault" },
            { label: "Langsamfahrstelle (reduzierte Geschwindigkeit)", value: "slow-order" },
            { label: "Akku niedrig (schonende Fahrt)", value: "low-battery" },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "everyMinutes", type: "number", min: 1, defaultValue: 10, label: "Würfeln alle (min)" },
            { name: "chancePct", type: "number", min: 0, max: 100, defaultValue: 30, label: "Wahrscheinlichkeit (%)" },
            { name: "durationSec", type: "number", min: 5, defaultValue: 45, label: "Dauer (s)" },
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
