import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

import { Users } from "./collections/Users.js";
import { Personas } from "./collections/Personas.js";
import { MockupData } from "./collections/MockupData.js";
import { Sessions } from "./collections/Sessions.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: "— CoSiMo",
    },
  },
  collections: [Personas, MockupData, Sessions, Users],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET ?? "dev-secret",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI ?? "",
    },
  }),
  sharp: undefined,
});
