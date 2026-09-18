import type { GlobalConfig } from "payload";
import { isInternal } from "../access/internal.js";

/** Speech routes: STT (Deepgram) and TTS (ElevenLabs) endpoints, models, the default voices. The catalog is the Stimmen global. */
export const SpeechConfig: GlobalConfig = {
  slug: "speech-config",
  label: "Sprache (STT / TTS)",
  admin: { group: "Operations", description: "Hören und Sprechen: Endpunkte, Modelle, Standardstimmen. Der Stimm-Katalog ist das Global „Stimmen“." },
  access: {
    // Non-sensitive routing/config — the realtime service reads it anonymously.
    read: () => true,
    // an admin in the UI, or the realtime service
    update: ({ req }) => Boolean(req.user) || isInternal(req),
  },
  fields: [
    {
      name: "stt",
      type: "group",
      label: "Speech-to-text",
      fields: [

        {
          name: "provider",
          type: "select",
          defaultValue: "deepgram",
          required: true,
          options: [{ label: "Deepgram", value: "deepgram" }],
        },
        {
          name: "baseUrl",
          type: "text",
          label: "Base URL",
          admin: { description: "Empty = https://api.deepgram.com" },
        },
        {
          name: "model",
          type: "text",
          admin: { description: "Empty = server default (DEEPGRAM_MODEL env)." },
        },
      ],
    },
    {
      name: "tts",
      type: "group",
      label: "Text-to-speech",
      fields: [

        {
          name: "provider",
          type: "select",
          defaultValue: "elevenlabs",
          required: true,
          options: [{ label: "ElevenLabs", value: "elevenlabs" }],
        },
        {
          name: "baseUrl",
          type: "text",
          label: "Base URL",
          admin: { description: "Empty = https://api.elevenlabs.io" },
        },
        {
          name: "voiceId",
          type: "text",
          label: "Voice ID",
          admin: { description: "Empty = server default (ELEVENLABS_VOICE_ID env)." },
        },
        {
          name: "voiceIdMale",
          type: "text",
          label: "Voice ID (männlich)",
          admin: {
            description:
              "Stimme für „männliche Stimme bitte“ (set_presentation voice=male). Leer = ELEVENLABS_VOICE_ID_MALE env; auch leer → Standardstimme bleibt.",
          },
        },
        {
          name: "model",
          type: "text",
          admin: { description: "Empty = server default (ELEVENLABS_MODEL env)." },
        },
      ],
    },
  ],
};
