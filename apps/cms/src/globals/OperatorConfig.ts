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
      name: "agent",
      type: "group",
      label: "Agent (the personality)",
      fields: [
        {
          name: "systemPrompt",
          type: "textarea",
          label: "System prompt (core)",
          admin: {
            rows: 18,
            description:
              "CoSiMos Kern-Systemprompt (Identität, Sprache, Grounding, Kabine, Anpassung, Ausdruck). Leer = eingebauter Default. Der Fahrgast-Teil (Brief, Accommodations, Erinnerungen) wird automatisch angehängt — hier nur den statischen Kern pflegen. Wirkt ab dem nächsten Turn.",
          },
        },
      ],
    },
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
        {
          name: "fallbackProvider",
          type: "select",
          defaultValue: "none",
          label: "Fallback provider",
          admin: {
            description:
              "Wird automatisch genutzt, wenn der primäre Endpunkt nicht erreichbar ist (Probe alle 15 s) — z. B. Anthropic, wenn der GX10 über Tailscale wegbricht. 'Keiner' = bei Ausfall Canned-Antworten.",
          },
          options: [
            { label: "Keiner (Canned-Antworten bei Ausfall)", value: "none" },
            { label: "Anthropic (Claude API)", value: "anthropic" },
            { label: "OpenAI-compatible", value: "openai-compatible" },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "fallbackBaseUrl", type: "text", label: "Fallback Base URL", admin: { description: "Leer = Provider-Default." } },
            { name: "fallbackModel", type: "text", label: "Fallback Modell", admin: { description: "Leer = Server-Default." } },
          ],
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
    {
      name: "cabin",
      type: "group",
      label: "Kabine (Licht)",
      admin: {
        description:
          "Der LPU-2-DMX-Controller im Kabinen-LAN. Die iPads sprechen ihn an (das Kabinennetz hat keine Internetverbindung), nicht der Server — hier steht nur, welche Adresse und welcher Playback wofür zuständig ist. Wirkt ohne Neustart.",
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
              "Welcher Playback (1–64) steuert welche Kabinenfunktion. Nicht zugeordnete Funktionen bleiben rein simuliert. An = in=100, Stufe = in=<Wert>, Aus = re (Release, die Standalone-Szene übernimmt wieder).",
          },
          fields: [
            {
              // Not `id`: an array row's own PK is called that (AGENTS.md rule 7).
              name: "control",
              type: "select",
              required: true,
              label: "Kabinenfunktion",
              options: [
                { label: "Innenlicht", value: "interior-light" },
                { label: "Leselampe", value: "reading-lamp" },
                { label: "Belüftung", value: "ventilation" },
                { label: "Fenstertönung", value: "window-tint" },
                { label: "Klangkulisse", value: "ambient-sound" },
              ],
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
      ],
    },
  ],
};
