import type { GlobalConfig } from "payload";

/**
 * Operator config — the AI endpoints CoSiMo talks to, editable live in the
 * admin. URLs and model names only; API keys stay in the server environment.
 * The realtime service reads this global on a short TTL, so a change here
 * (e.g. pointing the LLM at a DGX-hosted vLLM endpoint) takes effect on the
 * next turn without a redeploy.
 */
export const OperatorConfig: GlobalConfig = {
  slug: "operator-config",
  label: "Operator Config",
  admin: {
    group: "Operations",
    description:
      "AI endpoints (LLM, speech). URLs + models only — API keys live in the server env.",
  },
  access: {
    // Non-sensitive endpoint routing — the realtime service reads it anonymously.
    read: () => true,
    update: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: "llm",
      type: "group",
      label: "LLM (the thinking)",
      fields: [
        {
          name: "provider",
          type: "select",
          defaultValue: "anthropic",
          required: true,
          options: [
            { label: "Anthropic (Claude API)", value: "anthropic" },
            { label: "OpenAI-compatible (DGX / vLLM / TGI)", value: "openai-compatible" },
          ],
        },
        {
          name: "baseUrl",
          type: "text",
          label: "Base URL",
          admin: {
            description:
              "Empty = provider default. For a DGX/vLLM endpoint e.g. http://dgx.example.org:8000/v1",
          },
        },
        {
          name: "model",
          type: "text",
          admin: {
            description: "Empty = server default (ANTHROPIC_MODEL env).",
          },
        },
      ],
    },
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
          name: "model",
          type: "text",
          admin: { description: "Empty = server default (ELEVENLABS_MODEL env)." },
        },
      ],
    },
  ],
};
