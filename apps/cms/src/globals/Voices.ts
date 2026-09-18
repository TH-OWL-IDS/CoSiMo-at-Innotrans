import type { GlobalConfig } from "payload";
import { isInternal } from "../access/internal.js";

/** The voice catalog: what CoSiMo can switch to (set_presentation voice=<key>) and what the slit menu offers. */
export const Voices: GlobalConfig = {
  slug: "voices",
  label: "Stimmen",
  admin: { group: "Operations", description: "Stimm-Katalog pro Sprache. Reihenfolge zählt: die erste Stimme je Sprache + Geschlecht ist deren Standard." },
  access: {
    // Non-sensitive routing/config — the realtime service reads it anonymously.
    read: () => true,
    // an admin in the UI, or the realtime service
    update: ({ req }) => Boolean(req.user) || isInternal(req),
  },
  fields: [
    {
      name: "voices",
      type: "array",
      label: "Stimmen",
      admin: {
        description:
          "Stimm-Katalog: CoSiMo wählt per set_presentation voice=<key> anhand der Beschreibung („eine tiefere Stimme bitte“). Leer = nur Standard + männliche Stimme (env).",
      },
      fields: [
        {
          type: "row",
          fields: [
            { name: "key", type: "text", required: true, admin: { description: "Kurzer Slug (z. B. charlotte)." } },
            { name: "label", type: "text" },
            {
              name: "gender",
              type: "select",
              defaultValue: "female",
              options: [
                { label: "Weiblich", value: "female" },
                { label: "Männlich", value: "male" },
              ],
            },
            {
              name: "language",
              type: "select",
              defaultValue: "de",
              label: "Sprache",
              options: [
                { label: "Deutsch", value: "de" },
                { label: "Englisch", value: "en" },
              ],
            },
          ],
        },
        { name: "voiceId", type: "text", required: true, label: "Voice ID", admin: { description: "ElevenLabs Voice-ID." } },
        {
          name: "description",
          type: "text",
          required: true,
          admin: { description: "Eine kurze deutsche Zeile, wie die Stimme klingt — danach wählt das LLM." },
        },
      ],
    }
  ],
};
