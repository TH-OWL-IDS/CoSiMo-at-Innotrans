import type { Locale } from "./telemetry.js";

/**
 * The visitor questionnaire (apps/form → CMS `survey-responses`), defined
 * ONCE: the form renders from this list, the CMS collection binds its
 * fields to these ids at compile time, the CSV export orders its columns by
 * it. Pure data — this file is bundled into the browser and imported by the
 * CMS, so no node imports.
 *
 * Instrument (decided 2026-09-20): UMUX-Lite (2), AttrakDiff mini pragmatic
 * quality (4) + attractiveness (1 — „schlecht–gut" dropped as a near twin
 * of the UTAUT item), UTAUT attitude toward using (1), TAM2 behavioural
 * intention (1). Nine items, all 7-point, all required. „Das System" is
 * rendered as „CoSiMo" throughout. Changing an item = a new SURVEY_VERSION
 * and, for the CMS, a migration (see docs/form.md).
 */

export const SURVEY_VERSION = "2026-09-v1";
export const SURVEY_SCALE_MAX = 7;
/** Below this, a submission is flagged `suspect` (never rejected). */
export const SURVEY_MIN_SECONDS = 20;
/** A start token older than this is ignored (the tab was left open). */
export const SURVEY_TOKEN_MAX_AGE_SEC = 2 * 60 * 60;
/** The header the form sends its start token in. */
export const SURVEY_TOKEN_HEADER = "x-cosimo-start";

export type SurveyBlock = "umux" | "attrakdiff" | "utaut" | "bi";

export type SurveyItemId =
  | "umuxCapabilities"
  | "umuxEase"
  | "adConfusingClear"
  | "adComplicatedSimple"
  | "adUnpredictablePredictable"
  | "adImpracticalPractical"
  | "adUglyAttractive"
  | "utautAttitude"
  | "biIntend";

export interface SurveyItem {
  id: SurveyItemId;
  block: SurveyBlock;
  /** agree = a statement rated on the agreement anchors; differential = a
   *  word pair, 1 = left pole, 7 = right pole. */
  kind: "agree" | "differential";
  /** agree: the statement. differential: an optional stem („Die Nutzung von
   *  CoSiMo ist eine … Idee."); the AttrakDiff block carries its stem once. */
  text?: Record<Locale, string>;
  /** differential only: the two poles. */
  poles?: Record<Locale, [string, string]>;
}

export const SURVEY_BLOCKS: Record<SurveyBlock, { title: Record<Locale, string>; stem?: Record<Locale, string>; source: string }> = {
  umux: {
    title: { de: "Nützlich und einfach", en: "Useful and easy" },
    source: "UMUX-Lite (Lewis, Utesch & Maher 2015)",
  },
  attrakdiff: {
    title: { de: "Wie CoSiMo auf dich wirkt", en: "How CoSiMo comes across" },
    stem: { de: "CoSiMo ist …", en: "CoSiMo is …" },
    source: "AttrakDiff mini (Hassenzahl & Monk 2010) — pragmatische Qualität + Attraktivität",
  },
  utaut: {
    title: { de: "Deine Einschätzung", en: "Your assessment" },
    source: "UTAUT, attitude toward using (Venkatesh, Morris, Davis & Davis 2003)",
  },
  bi: {
    title: { de: "Würdest du es nutzen?", en: "Would you use it?" },
    source: "Behavioral intention (TAM2, Venkatesh & Davis 2000)",
  },
};

/** The seven agreement anchors, 1 … 7. */
export const SURVEY_AGREE_ANCHORS: Record<Locale, readonly string[]> = {
  de: ["Stimme überhaupt nicht zu", "Stimme nicht zu", "Stimme eher nicht zu", "Weder noch", "Stimme eher zu", "Stimme zu", "Stimme voll und ganz zu"],
  en: ["Strongly disagree", "Disagree", "Somewhat disagree", "Neither agree nor disagree", "Somewhat agree", "Agree", "Strongly agree"],
};

export const SURVEY_ITEMS: readonly SurveyItem[] = [
  {
    id: "umuxCapabilities",
    block: "umux",
    kind: "agree",
    text: { de: "Die Funktionen von CoSiMo erfüllen meine Anforderungen.", en: "CoSiMo's capabilities meet my requirements." },
  },
  {
    id: "umuxEase",
    block: "umux",
    kind: "agree",
    text: { de: "CoSiMo ist einfach zu benutzen.", en: "CoSiMo is easy to use." },
  },
  { id: "adConfusingClear", block: "attrakdiff", kind: "differential", poles: { de: ["verwirrend", "übersichtlich"], en: ["confusing", "structured"] } },
  { id: "adComplicatedSimple", block: "attrakdiff", kind: "differential", poles: { de: ["kompliziert", "einfach"], en: ["complicated", "simple"] } },
  { id: "adUnpredictablePredictable", block: "attrakdiff", kind: "differential", poles: { de: ["unberechenbar", "voraussagbar"], en: ["unpredictable", "predictable"] } },
  { id: "adImpracticalPractical", block: "attrakdiff", kind: "differential", poles: { de: ["unpraktisch", "praktisch"], en: ["impractical", "practical"] } },
  { id: "adUglyAttractive", block: "attrakdiff", kind: "differential", poles: { de: ["hässlich", "schön"], en: ["ugly", "attractive"] } },
  {
    id: "utautAttitude",
    block: "utaut",
    kind: "differential",
    text: { de: "Die Nutzung von CoSiMo ist eine … Idee.", en: "Using CoSiMo is a … idea." },
    poles: { de: ["schlechte", "gute"], en: ["bad", "good"] },
  },
  {
    id: "biIntend",
    block: "bi",
    kind: "agree",
    text: { de: "Vorausgesetzt, ich hätte Zugang zu CoSiMo, beabsichtige ich, es zu nutzen.", en: "Assuming I had access to CoSiMo, I intend to use it." },
  },
];

export const SURVEY_ITEM_IDS: readonly SurveyItemId[] = SURVEY_ITEMS.map((i) => i.id);

/** What the form POSTs to `/api/survey-responses` — flat, one key per item. */
export type SurveySubmission = Record<SurveyItemId, number> & {
  responseId: string;
  lang: Locale;
  consent: true;
  /** Client-measured seconds from open to submit; metadata, not trusted. */
  durationSec: number | null;
};

/** True for an integer on the scale. */
export const isScaleValue = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= SURVEY_SCALE_MAX;
