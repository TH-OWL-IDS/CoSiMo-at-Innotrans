import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

import { Users } from "./collections/Users.js";
import { Personas } from "./collections/Personas.js";
import { Sessions } from "./collections/Sessions.js";
import { SurveyResponses } from "./collections/SurveyResponses.js";
import { surveyStartEndpoint } from "./collections/surveyToken.js";
import { AgentConfig } from "./globals/AgentConfig.js";
import { LlmConfig } from "./globals/LlmConfig.js";
import { SpeechConfig } from "./globals/SpeechConfig.js";
import { Voices } from "./globals/Voices.js";
import { CabinConfig } from "./globals/CabinConfig.js";
import { RouteConfig } from "./globals/RouteConfig.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: "— CoSiMo",
    },
  },
  collections: [Personas, Sessions, SurveyResponses, Users],
  globals: [AgentConfig, LlmConfig, SpeechConfig, Voices, CabinConfig, RouteConfig],
  // The questionnaire's start token (docs/form.md). Root-level on purpose.
  endpoints: [surveyStartEndpoint],
  // The native kiosk app's WebView origin, plus the public site itself.
  cors: [
    process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:6100",
    "capacitor://localhost",
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET ?? "dev-secret",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI ?? "",
    },
    // Push only in true dev servers. Never in production images — prod
    // schema changes ship as migrations (docs/cms.md), and a stray push
    // writes the 'dev' marker that stalls migrate-on-boot.
    push: process.env.NODE_ENV !== "production",
  }),
  sharp: undefined,
});
