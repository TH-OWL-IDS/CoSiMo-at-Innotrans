import type { GlobalConfig } from "payload";
import { isInternal } from "../access/internal.js";

/** The agent's core system prompt — the personality. The rider part is appended in code. */
export const AgentConfig: GlobalConfig = {
  slug: "agent-config",
  label: "Agent",
  admin: { group: "Operations", description: "CoSiMos Kern-Systemprompt. Leer = eingebauter Default." },
  access: {
    // Non-sensitive routing/config — the realtime service reads it anonymously.
    read: () => true,
    // an admin in the UI, or the realtime service
    update: ({ req }) => Boolean(req.user) || isInternal(req),
  },
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
};
