import {
  SCHEME_IDS,
  type Accommodations,
  type Locale,
  type SeatCard,
  type SeatCardOption,
  type VoiceCatalogEntry,
} from "@cosimo/shared";

/**
 * Card builders for the slit. A small fixed vocabulary — every kind has one
 * layout on the kiosk, so "minimal" is enforced by construction, not taste.
 *
 * Model cards (`local: false`): a tap sends the label back as the rider's
 * next message. Local cards: the hub applies the value itself (no LLM round)
 * and speaks a short templated confirmation — see `localAnswer`.
 */

let counter = 0;
const newId = () => `card-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const CARD_TTL = 20_000;
const WIZARD_TTL = 45_000;

const de = (lang: Locale) => lang === "de";

export function confirmCard(question: string, lang: Locale): SeatCard {
  return {
    id: newId(),
    kind: "confirm",
    question,
    local: false,
    ttlMs: CARD_TTL,
    options: [
      { value: de(lang) ? "Ja" : "Yes", label: de(lang) ? "Ja" : "Yes", icon: "check" },
      { value: de(lang) ? "Nein" : "No", label: de(lang) ? "Nein" : "No", icon: "x" },
    ],
  };
}

export function listCard(question: string, options: string[]): SeatCard {
  return {
    id: newId(),
    kind: "list",
    question,
    local: false,
    ttlMs: CARD_TTL,
    options: options.slice(0, 4).map((o) => ({ value: o, label: o })),
  };
}

/** Skip chip for wizard steps; the last step gets "done" instead. */
function stepExtras(lang: Locale, step?: { index: number; total: number }): SeatCardOption[] {
  if (!step) return [];
  return step.index >= step.total - 1
    ? [{ value: "__done", label: de(lang) ? "Fertig" : "Done", icon: "done" }]
    : [{ value: "__skip", label: de(lang) ? "Überspringen" : "Skip", icon: "skip" }];
}

export function themesCard(question: string, lang: Locale, step?: SeatCard["step"]): SeatCard {
  return {
    id: newId(),
    kind: "themes",
    question,
    local: true,
    ttlMs: step ? WIZARD_TTL : CARD_TTL,
    step,
    // the kiosk owns the palette: it maps ids to colours + labels
    options: [...SCHEME_IDS.map((id) => ({ value: id, label: id })), ...stepExtras(lang, step)],
  };
}

export function voicesCard(question: string, lang: Locale, voices: VoiceCatalogEntry[], step?: SeatCard["step"]): SeatCard {
  const opts: SeatCardOption[] = voices.length
    ? voices.slice(0, 6).map((v) => ({ value: v.key, label: v.label }))
    : [
        { value: "female", label: de(lang) ? "Weiblich" : "Female" },
        { value: "male", label: de(lang) ? "Männlich" : "Male" },
      ];
  return { id: newId(), kind: "voices", question, local: true, ttlMs: step ? WIZARD_TTL : CARD_TTL, step, options: [...opts, ...stepExtras(lang, step)] };
}

const TEXT_SIZES = ["s", "m", "l", "xl"] as const;

export function scaleCard(
  question: string,
  setting: "volume" | "speechRate" | "textSize",
  acc: Accommodations,
  lang: Locale,
  step?: SeatCard["step"],
): SeatCard {
  const scale: SeatCard["scale"] =
    setting === "volume"
      ? { setting, min: 0.2, max: 1, step: 0.05, value: acc.volume ?? 1, control: "slider" }
      : setting === "speechRate"
        ? { setting, min: 0.7, max: 1.3, step: 0.05, value: acc.speechRate ?? 1, control: "slider" }
        : { setting, min: 0, max: 3, step: 1, value: TEXT_SIZES.indexOf(acc.textSize), control: "stepper" };
  return { id: newId(), kind: "scale", question, local: true, ttlMs: step ? WIZARD_TTL : CARD_TTL, step, scale, options: stepExtras(lang, step) };
}

/* ── the customizer wizard ─────────────────────────────────────────────── */

export const CUSTOMIZE_STEPS = ["theme", "textSize", "contrast", "voice", "speechRate"] as const;
export type CustomizeStep = (typeof CUSTOMIZE_STEPS)[number];

/** The spoken question for a step (also the card's context line). */
export function customizeQuestion(step: CustomizeStep, lang: Locale): string {
  const q: Record<CustomizeStep, [string, string]> = {
    theme: ["Welche Farbe magst du?", "Which colour do you like?"],
    textSize: ["Wie groß soll die Schrift sein?", "How big should the text be?"],
    contrast: ["Normaler oder hoher Kontrast?", "Normal or high contrast?"],
    voice: ["Welche Stimme gefällt dir?", "Which voice do you like?"],
    speechRate: ["Und wie schnell soll ich sprechen?", "And how fast should I speak?"],
  };
  return q[step][de(lang) ? 0 : 1];
}

export function customizeCard(index: number, lang: Locale, voices: VoiceCatalogEntry[], acc: Accommodations): SeatCard | null {
  const step = CUSTOMIZE_STEPS[index];
  if (!step) return null;
  const pos = { index, total: CUSTOMIZE_STEPS.length };
  const q = customizeQuestion(step, lang);
  switch (step) {
    case "theme":
      return themesCard(q, lang, pos);
    case "textSize":
      return {
        id: newId(), kind: "list", question: q, local: true, ttlMs: WIZARD_TTL, step: pos,
        options: [
          { value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }, { value: "xl", label: "XL" },
          ...stepExtras(lang, pos),
        ],
      };
    case "contrast":
      return {
        id: newId(), kind: "list", question: q, local: true, ttlMs: WIZARD_TTL, step: pos,
        options: [
          { value: "normal", label: de(lang) ? "Normal" : "Normal" },
          { value: "high", label: de(lang) ? "Hoch" : "High" },
          ...stepExtras(lang, pos),
        ],
      };
    case "voice":
      return voicesCard(q, lang, voices, pos);
    case "speechRate":
      return scaleCard(q, "speechRate", acc, lang, pos);
  }
}

/* ── answering local cards ─────────────────────────────────────────────── */

export interface LocalAnswer {
  patch: Partial<Accommodations>;
  /** Short spoken confirmation (before any follow-up question). */
  spoken: string;
}

const THEME_LABEL: Record<string, [string, string]> = {
  classic: ["Klassisch", "Classic"], night: ["Nacht", "Night"], ocean: ["Ozean", "Ocean"],
  forest: ["Wald", "Forest"], sun: ["Sonne", "Sun"], berry: ["Beere", "Berry"], slate: ["Schiefer", "Slate"],
};

/** Turn a tapped value on a local card into an accommodation patch + words. */
export function localAnswer(card: SeatCard, value: string, lang: Locale, voices: VoiceCatalogEntry[], acc: Accommodations): LocalAnswer | null {
  const g = de(lang);
  switch (card.kind) {
    case "themes": {
      if (!(SCHEME_IDS as readonly string[]).includes(value)) return null;
      const label = THEME_LABEL[value]?.[g ? 0 : 1] ?? value;
      return { patch: { theme: value }, spoken: g ? `${label} — so?` : `${label} — like this?` };
    }
    case "voices": {
      if (value === "female" || value === "male") {
        return { patch: { voiceGender: value, voice: "" }, spoken: g ? "So klinge ich jetzt." : "This is how I sound now." };
      }
      const v = voices.find((x) => x.key === value);
      if (!v) return null;
      return { patch: { voice: v.key, voiceGender: v.gender }, spoken: g ? `So klinge ich jetzt — ${v.label}.` : `This is how I sound now — ${v.label}.` };
    }
    case "list": {
      // wizard list steps carry setting values (textSize / contrast)
      if (card.step?.index === CUSTOMIZE_STEPS.indexOf("textSize") && (TEXT_SIZES as readonly string[]).includes(value)) {
        return { patch: { textSize: value as Accommodations["textSize"] }, spoken: g ? "So groß?" : "This big?" };
      }
      if (card.step?.index === CUSTOMIZE_STEPS.indexOf("contrast") && (value === "normal" || value === "high")) {
        return { patch: { contrast: value }, spoken: g ? "Okay." : "Okay." };
      }
      return null;
    }
    case "scale": {
      const sc = card.scale;
      if (!sc) return null;
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      if (sc.setting === "textSize") {
        const size = TEXT_SIZES[Math.max(0, Math.min(3, Math.round(n)))]!;
        return { patch: { textSize: size }, spoken: g ? "So groß?" : "This big?" };
      }
      const clamped = Math.max(sc.min, Math.min(sc.max, n));
      if (sc.setting === "volume") {
        const prev = acc.volume ?? 1;
        const spoken = clamped < prev ? (g ? "Etwas leiser — so?" : "A bit quieter — like this?") : clamped > prev ? (g ? "Etwas lauter — so?" : "A bit louder — like this?") : (g ? "So?" : "Like this?");
        return { patch: { volume: Math.round(clamped * 100) / 100 }, spoken };
      }
      return { patch: { speechRate: Math.round(clamped * 100) / 100 }, spoken: g ? "So spreche ich jetzt." : "This is how I speak now." };
    }
    default:
      return null;
  }
}

/** The wizard's closing line. */
export function customizeDone(lang: Locale, persistent: boolean): string {
  if (de(lang)) return persistent ? "Fertig — so bleibt es, auch beim nächsten Mal." : "Fertig — so bleibt es für diese Fahrt.";
  return persistent ? "Done — it stays like this, next time too." : "Done — it stays like this for this ride.";
}
