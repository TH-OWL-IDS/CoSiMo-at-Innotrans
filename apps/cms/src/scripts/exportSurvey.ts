/**
 * Export the questionnaire as CSV — one row per response, columns ordered
 * by the shared instrument, semicolon-separated with a UTF-8 BOM so German
 * Excel opens it correctly. Writes to stdout (or the path in argv[2]).
 *
 *   pnpm --filter @cosimo/cms survey:export > antworten.csv
 *   docker compose exec cms pnpm survey:export /tmp/antworten.csv   # prod
 *
 * Needs DATABASE_URI + PAYLOAD_SECRET like the seed. Local API, so access
 * control is bypassed — this is an operator tool, never exposed.
 */
import { writeFileSync } from "node:fs";
import { getPayload } from "payload";
import { SURVEY_ITEM_IDS } from "@cosimo/shared";
import config from "../payload.config.js";

const payload = await getPayload({ config });
const { docs } = await payload.find({ collection: "survey-responses", limit: 0, sort: "createdAt", depth: 0, overrideAccess: true });

const columns = ["responseId", "createdAt", "lang", "formVersion", ...SURVEY_ITEM_IDS, "durationSec", "tokenAgeSec", "suspect", "suspectReason"] as const;
const cell = (v: unknown): string => {
  if (v == null) return "";
  const s = typeof v === "boolean" ? (v ? "1" : "0") : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = [columns.join(";"), ...docs.map((d) => columns.map((c) => cell((d as unknown as Record<string, unknown>)[c])).join(";"))];
const csv = "﻿" + lines.join("\r\n") + "\r\n";

const out = process.argv[2];
if (out) {
  writeFileSync(out, csv, "utf8");
  console.error(`${docs.length} Antworten → ${out}`);
} else {
  process.stdout.write(csv);
}
process.exit(0);
