import type { GlobalConfig } from "payload";
import { isInternal } from "../access/internal.js";

/** The LLM route: provider, endpoint, model, fallback, generation. URLs and models only — keys stay in the server env. */
export const LlmConfig: GlobalConfig = {
  slug: "llm-config",
  label: "LLM",
  admin: { group: "Operations", description: "Das Denken: Provider, Endpunkt, Modell, Fallback, Generierung. Wirkt live (≤ 15 s)." },
  access: {
    // Non-sensitive routing/config — the realtime service reads it anonymously.
    read: () => true,
    // an admin in the UI, or the realtime service
    update: ({ req }) => Boolean(req.user) || isInternal(req),
  },
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
    {
      name: "toolForcing",
      type: "checkbox",
      defaultValue: false,
      label: "Tool-Zwang",
      admin: {
        description:
          "Aus (Standard): das Modell entscheidet selbst, wann es ein Tool ruft. An: bei klaren Licht-, Einstellungs- und Erinnerungs-Sätzen erzwingt der Hub den passenden Tool-Aufruf im ersten Schritt (Schutz gegen „ist jetzt an“ ohne Aufruf, wie 2026-09-03 bei Qwen gemessen).",
      },
    },
    {
      name: "generation",
      type: "group",
      label: "Generierung",
      admin: {
        description:
          "Wirkt live (≤ 15 s) auf jeden Turn. Vorsicht: Temperatur 1,0 hat auf Qwen degenerierte Ein-Wort-Antworten erzeugt — deshalb sind die Bereiche begrenzt. Leer = Server-Default.",
      },
      fields: [
        {
          type: "row",
          fields: [
            { name: "temperature", type: "number", label: "Temperatur", min: 0.1, max: 1, admin: { step: 0.05, description: "Default 0,7" } },
            { name: "topP", type: "number", label: "Top-p", min: 0.5, max: 1, admin: { step: 0.05, description: "Default 0,8" } },
            { name: "maxTokens", type: "number", label: "Max. Tokens", min: 128, max: 2048, admin: { step: 64, description: "Default 1024" } },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "repetitionPenalty", type: "number", label: "Wiederholungs-Strafe", min: 1, max: 1.3, admin: { step: 0.05, description: "Default 1,0 (nur vLLM)" } },
            { name: "thinking", type: "checkbox", label: "Thinking", defaultValue: false, admin: { description: "Qwen-Denkmodus pro Anfrage — kostet Latenz." } },
          ],
        },
      ],
    },
  
  ],
};
