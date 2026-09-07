import type { Locale } from "./telemetry.js";

/**
 * Showcase ("Schaustellung"): what a seat nobody can reach performs, endlessly
 * and silently — the face lives, thinks, "speaks" with subtitles, listens,
 * changes colour, dozes. These are the subtitle lines; the choreography lives
 * in seat-ui `useShowcase`. Kept in code for now (a CMS list is the obvious
 * next step once the wording settles).
 */
export const SHOWCASE_LINES: Record<Locale, string>[] = [
  { de: "Hallo, ich bin CoSiMo.", en: "Hello, I am CoSiMo." },
  { de: "Ich fahre mit dir im MonoCab.", en: "I ride with you in the MonoCab." },
  { de: "Frag mich, wo wir gerade sind.", en: "Ask me where we are right now." },
  { de: "Ich kann dir das Licht anmachen.", en: "I can turn the light on for you." },
  { de: "Sag mir, wenn ich leiser sprechen soll.", en: "Tell me if I should speak more quietly." },
  { de: "Ich merke mir, wie du es gern hast.", en: "I remember how you like things." },
  { de: "Deine Karte sagt mir, wer du bist.", en: "Your card tells me who you are." },
  { de: "Der nächste Halt kommt in wenigen Minuten.", en: "The next stop is a few minutes away." },
  { de: "Ich kann größer schreiben, wenn du magst.", en: "I can write larger if you like." },
  { de: "Halte die Taste und sprich mit mir.", en: "Hold the button and talk to me." },
  { de: "Ich höre dir zu.", en: "I am listening." },
  { de: "Gute Fahrt!", en: "Enjoy the ride!" },
];
