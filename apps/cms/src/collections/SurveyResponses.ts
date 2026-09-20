import { APIError, type CollectionConfig, type Field } from "payload";
import {
  SURVEY_ITEMS,
  SURVEY_TOKEN_HEADER,
  SURVEY_VERSION,
  isScaleValue,
  type SurveyItemId,
} from "@cosimo/shared";
import { checkSurveyToken } from "./surveyToken.js";

/**
 * Survey responses — the anonymous visitor questionnaire (apps/form, reached
 * by QR code after trying CoSiMo). NOT linked to `sessions`: no seat, no
 * session id, no IP, no user agent — a row is a set of numbers and a date.
 *
 * The one publicly writable collection in the stack, so the create path is
 * strict: the hook rebuilds the document from scratch (only known keys), every
 * item must be an integer 1–7, consent must be true or the request fails,
 * the version is stamped server-side, and the start token (surveyToken.ts)
 * decides `suspect`. Nothing is ever updated; only admins delete.
 *
 * The nine item fields are written by hand (not mapped from SURVEY_ITEMS) so
 * the migration diff stays readable — the `satisfies` below makes a mismatch
 * between the shared instrument and this schema a type error.
 */

/** One number field per item, 1–7, read-only in the admin. */
function itemField(name: SurveyItemId, label: string): Field {
  return { name, type: "number", required: true, min: 1, max: 7, admin: { readOnly: true }, label };
}

const ITEM_FIELDS = {
  umuxCapabilities: itemField("umuxCapabilities", "UMUX · erfüllt Anforderungen"),
  umuxEase: itemField("umuxEase", "UMUX · einfach zu benutzen"),
  adConfusingClear: itemField("adConfusingClear", "AttrakDiff · verwirrend–übersichtlich"),
  adComplicatedSimple: itemField("adComplicatedSimple", "AttrakDiff · kompliziert–einfach"),
  adUnpredictablePredictable: itemField("adUnpredictablePredictable", "AttrakDiff · unberechenbar–voraussagbar"),
  adImpracticalPractical: itemField("adImpracticalPractical", "AttrakDiff · unpraktisch–praktisch"),
  adUglyAttractive: itemField("adUglyAttractive", "AttrakDiff · hässlich–schön"),
  utautAttitude: itemField("utautAttitude", "UTAUT · schlechte–gute Idee"),
  biIntend: itemField("biIntend", "BI · beabsichtige zu nutzen"),
} satisfies Record<SurveyItemId, Field>;

const bad = (message: string) => new APIError(message, 400, undefined, true);

export const SurveyResponses: CollectionConfig = {
  slug: "survey-responses",
  admin: {
    useAsTitle: "responseId",
    group: "Research",
    description:
      "Anonyme Besucherbefragung (form-cosimo, per QR-Code). Kein Bezug zu Sessions, keine IP. Nur lesen — geschrieben vom Fragebogen selbst.",
    defaultColumns: ["responseId", "lang", "suspect", "durationSec", "createdAt"],
  },
  access: {
    // Anyone may submit — the hook below is the gate. Operators read, admins delete, nobody edits.
    create: () => true,
    read: ({ req }) => Boolean(req.user),
    update: () => false,
    delete: ({ req }) => req.user?.role === "admin",
  },
  hooks: {
    beforeValidate: [
      ({ data, operation, req }) => {
        if (operation !== "create") return data;
        const src = (data ?? {}) as Record<string, unknown>;

        if (src.consent !== true) throw new APIError("Ohne Einwilligung wird nichts gespeichert.", 403, undefined, true);
        const responseId = typeof src.responseId === "string" ? src.responseId.trim() : "";
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(responseId)) throw bad("responseId fehlt oder ist ungültig.");
        const lang = src.lang === "en" ? "en" : src.lang === "de" ? "de" : null;
        if (!lang) throw bad("lang muss de oder en sein.");

        // Rebuild from scratch: only the keys we know, every item an integer 1–7.
        const doc: Record<string, unknown> = { responseId, lang, consent: true, formVersion: SURVEY_VERSION };
        for (const item of SURVEY_ITEMS) {
          const v = src[item.id];
          if (!isScaleValue(v)) throw bad(`${item.id}: Wert 1–7 erwartet.`);
          doc[item.id] = v;
        }
        const dur = src.durationSec;
        doc.durationSec = typeof dur === "number" && Number.isFinite(dur) && dur >= 0 ? Math.round(Math.min(dur, 86_400)) : null;

        // The honest timer: flag, never reject.
        const check = checkSurveyToken(req.headers?.get(SURVEY_TOKEN_HEADER));
        doc.suspect = !check.ok;
        doc.suspectReason = check.ok ? null : check.reason;
        doc.tokenAgeSec = check.ageSec ?? null;
        return doc;
      },
    ],
  },
  fields: [
    { name: "responseId", type: "text", required: true, unique: true, admin: { readOnly: true, description: "Zufällige ID aus der Browser-Sitzung — verhindert Doppelsenden." } },
    { name: "lang", type: "select", required: true, options: ["de", "en"], admin: { readOnly: true } },
    ITEM_FIELDS.umuxCapabilities,
    ITEM_FIELDS.umuxEase,
    ITEM_FIELDS.adConfusingClear,
    ITEM_FIELDS.adComplicatedSimple,
    ITEM_FIELDS.adUnpredictablePredictable,
    ITEM_FIELDS.adImpracticalPractical,
    ITEM_FIELDS.adUglyAttractive,
    ITEM_FIELDS.utautAttitude,
    ITEM_FIELDS.biIntend,
    { name: "consent", type: "checkbox", required: true, admin: { readOnly: true, description: "Immer wahr — ohne Einwilligung wird kein Datensatz angelegt." } },
    { name: "formVersion", type: "text", admin: { readOnly: true, description: "Version des Instruments (serverseitig gestempelt)." } },
    {
      type: "row",
      fields: [
        { name: "durationSec", type: "number", admin: { readOnly: true, description: "Vom Browser gemessen — nicht vertrauenswürdig." } },
        { name: "tokenAgeSec", type: "number", admin: { readOnly: true, description: "Alter des Start-Tokens beim Absenden (Server-Uhr)." } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "suspect", type: "checkbox", admin: { readOnly: true, description: "Unter 20 s, ohne oder mit ungültigem Start-Token." } },
        { name: "suspectReason", type: "select", options: ["missing", "invalid", "expired", "too-fast"], admin: { readOnly: true } },
      ],
    },
  ],
};
