import type { GlobalConfig } from "payload";
import { LPU2_KEYS } from "@cosimo/shared";
import { isInternal } from "../access/internal.js";

/** The cabin light: the LPU-2's address on the cabin LAN, the playback map, the light scenes. */
export const CabinConfig: GlobalConfig = {
  slug: "cabin-config",
  label: "Kabine (Licht)",
  admin: {
    group: "Operations",
    description:
      "Der LPU-2-DMX-Controller im Kabinen-LAN. Die iPads sprechen ihn an (das Kabinennetz hat keine Internetverbindung), nicht der Server — hier steht nur, welche Adresse und welcher Playback wofür zuständig ist, und die Lichtszenen. Wirkt ohne Neustart.",
  },
  access: {
    // Non-sensitive routing/config — the realtime service reads it anonymously.
    read: () => true,
    // an admin in the UI, or the realtime service
    update: ({ req }) => Boolean(req.user) || isInternal(req),
  },
  fields: [

    {
      name: "lpu2BaseUrl",
      type: "text",
      label: "LPU-2 Base URL (Kabinen-LAN)",
      admin: {
        description:
          "z. B. http://10.0.0.50 — die Adresse aus Sicht der iPads. Leer = kein echtes Licht, alles bleibt simuliert.",
      },
    },
    {
      name: "lpu2Playbacks",
      type: "array",
      label: "Playback-Zuordnung",
      admin: {
        description:
          "Welcher Playback (1–64) steuert welchen Eintrag des Rig-Katalogs. Nicht zugeordnete Einträge bleiben rein simuliert. An = pbXX/go (Cue mit gespeicherten Werten), Aus = pbXX/re (Release, die Standalone-Szene übernimmt). Playbacks sind additiv — bei CW/WW-Paaren released der Hub das Geschwister automatisch. Fahrgast-Einträge erreicht CoSiMo per Stimme (Innenlicht = Rooflight, warmweiß als Default; Leselampe je Sitz), Zonen und Signale nur das Standpersonal über die Konsole.",
      },
      fields: [
        {
          // Not `id`: an array row's own PK is called that (AGENTS.md rule 7).
          name: "control",
          type: "select",
          required: true,
          label: "Rig-Eintrag",
          // Generated from the shared rig catalog (packages/shared
          // cabin.ts LPU2_KEYS) — the hub drops keys it does not know,
          // so a stray row is harmless.
          options: LPU2_KEYS.map((k) => ({ label: k.label, value: k.key })),
        },
        {
          name: "playback",
          type: "number",
          required: true,
          min: 1,
          max: 64,
          label: "Playback (1–64)",
        },
      ],
    },
    {
      name: "lightScenes",
      type: "array",
      label: "Lichtszenen",
      admin: {
        description:
          "Die drei Szenen, zwischen denen Fahrgast, CoSiMo, Panel-Taste und Konsole umschalten. Pro Gruppe (Lichtlinien, Deckenpaneel, Boden) Helligkeit 0–100 und Kalt/Warm −100…100 (negativ = wärmer, positiv = kälter, 0 = beide Weißtöne voll). Am einfachsten über die Konsole pflegen: Regler stellen, „als Szene speichern“.",
      },
      fields: [
        { name: "key", type: "text", required: true, label: "Schlüssel", admin: { description: "z. B. standard, gemuetlich, hell — CoSiMo und die Taste referenzieren ihn." } },
        { name: "label", type: "text", required: true, label: "Name" },
        ...(["roofline", "rooflight", "floor"] as const).map((g) => ({
          name: g,
          type: "group" as const,
          label: g === "roofline" ? "Lichtlinien" : g === "rooflight" ? "Deckenpaneel" : "Boden",
          fields: [
            { name: "on", type: "checkbox" as const, defaultValue: true, label: "an" },
            { name: "intensity", type: "number" as const, min: 0, max: 100, defaultValue: 100, label: "Helligkeit (0–100)" },
            { name: "bias", type: "number" as const, min: -100, max: 100, defaultValue: -100, label: "Kalt/Warm (−100 warm … 100 kalt)" },
          ],
        })),
      ],
    },
  
  ],
};
