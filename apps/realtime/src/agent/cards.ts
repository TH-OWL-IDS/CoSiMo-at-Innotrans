import {
  SCHEME_IDS,
  VOICE_TONES,
  type Accommodations,
  type Locale,
  type SeatCard,
  type VoiceCatalogEntry,
} from "@cosimo/shared";

/**
 * The slit's one remaining card: a yes/no question from the model. A tap
 * sends the label back as the rider's next message. Everything the rider
 * used to answer on cards (colour, voice, sliders, the wizard) now lives in
 * the settings menu — see `settingsSpoken` below and packages/shared
 * settings.ts.
 */

let counter = 0;
const newId = () => `card-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const CARD_TTL = 20_000;

const de = (lang: Locale) => lang === "de";

export function confirmCard(question: string, lang: Locale): SeatCard {
  return {
    id: newId(),
    kind: "confirm",
    question,
    ttlMs: CARD_TTL,
    options: [
      { value: de(lang) ? "Ja" : "Yes", label: de(lang) ? "Ja" : "Yes", icon: "check" },
      { value: de(lang) ? "Nein" : "No", label: de(lang) ? "Nein" : "No", icon: "x" },
    ],
  };
}

/* ── the settings menu's spoken confirmations ─────────────────────────── */

const THEME_LABEL: Record<string, [string, string]> = {
  weiss: ["Weiß", "White"], dunkel: ["Dunkel", "Dark"], blau: ["Blau", "Blue"],
  gruen: ["Grün", "Green"], gelb: ["Gelb", "Yellow"], rosa: ["Rosa", "Pink"], grau: ["Grau", "Grey"],
};
const TONE_LABEL: Record<string, [string, string]> = {
  neutral: ["neutral", "neutral"], warm: ["warm", "warm"], ruhig: ["ruhig", "calm"], lebhaft: ["lebhaft", "lively"],
};

/**
 * Validate one patch from the settings menu and word CoSiMo's short spoken
 * confirmation — spoken in the NEW setting (the new voice, the new volume…),
 * which is how the rider judges it. Returns null for a patch the menu should
 * never send (an unknown theme id, a voice not in the catalog).
 */
export function settingsSpoken(
  patch: Partial<Accommodations>,
  lang: Locale,
  voices: VoiceCatalogEntry[],
  before: Accommodations,
): { patch: Partial<Accommodations>; spoken: string } | null {
  const g = de(lang);
  if (patch.theme !== undefined) {
    if (!(SCHEME_IDS as readonly string[]).includes(patch.theme)) return null;
    const label = THEME_LABEL[patch.theme]?.[g ? 0 : 1] ?? patch.theme;
    return { patch: { theme: patch.theme }, spoken: g ? `${label} — so?` : `${label} — like this?` };
  }
  if (patch.textSize !== undefined) {
    if (!["s", "m", "l"].includes(patch.textSize)) return null;
    return { patch: { textSize: patch.textSize }, spoken: g ? "So groß?" : "This big?" };
  }
  if (patch.volume !== undefined) {
    const v = Math.max(0.2, Math.min(1, Number(patch.volume)));
    if (!Number.isFinite(v)) return null;
    const prev = before.volume ?? 1;
    const spoken = v < prev ? (g ? "Etwas leiser — so?" : "A bit quieter — like this?") : v > prev ? (g ? "Etwas lauter — so?" : "A bit louder — like this?") : g ? "So?" : "Like this?";
    return { patch: { volume: Math.round(v * 100) / 100 }, spoken };
  }
  if (patch.speechRate !== undefined) {
    const v = Math.max(0.7, Math.min(1.3, Number(patch.speechRate)));
    if (!Number.isFinite(v)) return null;
    return { patch: { speechRate: Math.round(v * 100) / 100 }, spoken: g ? "So spreche ich jetzt." : "This is how I speak now." };
  }
  if (patch.voice !== undefined || patch.voiceGender !== undefined) {
    if (patch.voice) {
      const v = voices.find((x) => x.key === patch.voice);
      if (!v) return null;
      return { patch: { voice: v.key, voiceGender: v.gender }, spoken: g ? `So klinge ich jetzt — ${v.label}.` : `This is how I sound now — ${v.label}.` };
    }
    if (patch.voiceGender === "female" || patch.voiceGender === "male") {
      return { patch: { voiceGender: patch.voiceGender, voice: "" }, spoken: g ? "So klinge ich jetzt." : "This is how I sound now." };
    }
    return null;
  }
  if (patch.voiceTone !== undefined) {
    if (!(VOICE_TONES as readonly string[]).includes(patch.voiceTone)) return null;
    const label = TONE_LABEL[patch.voiceTone]?.[g ? 0 : 1] ?? patch.voiceTone;
    return { patch: { voiceTone: patch.voiceTone }, spoken: g ? `Eher ${label} — so?` : `More ${label} — like this?` };
  }
  return null;
}
