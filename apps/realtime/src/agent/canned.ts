/**
 * Offline canned responder — keeps the demo alive when the cloud LLM is
 * unreachable (hostile hall network) or when the host forces demo mode. A small
 * bilingual scripted matcher answers the common asks, grounded in the current
 * (mocked) telemetry, and can drive the cabin light. When nothing matches it
 * returns a friendly "didn't catch that" with suggestions.
 *
 * This is intentionally simple and dependency-free: no model, no network.
 */

import type {
  CabinControlId,
  ExpressiveEmotion,
  Locale,
  MonoCabTelemetry,
} from "@cosimo/shared";

export interface CannedResult {
  text: string;
  emotion: ExpressiveEmotion;
  /** A cabin action to perform (e.g. the interior light). */
  cabin?: { control: CabinControlId; on: boolean };
  /** Whether this came from a real script match (vs. the not-understood fallback). */
  matched: boolean;
}

const SUGGESTIONS: Record<Locale, string[]> = {
  de: ["Wie schnell fahren wir?", "Wann kommen wir an?", "Mach das Licht an"],
  en: ["How fast are we going?", "When do we arrive?", "Turn on the light"],
};

const has = (text: string, ...needles: string[]) => needles.some((n) => text.includes(n));

/**
 * Honest apology for when the LLM errored mid-turn (as opposed to the
 * offline matcher's "didn't understand"): the rider WAS understood — the
 * brain was unreachable. Points at the canned asks that still work.
 */
export function errorReply(lang: Locale): CannedResult {
  const de = lang === "de";
  return {
    matched: false,
    emotion: "sad",
    text: de
      ? "Entschuldige, da ist gerade etwas schiefgelaufen — ich kann im Moment nicht richtig nachdenken. Versuch es gleich nochmal, oder frag mich zur Fahrt, zum Beispiel: „Wie schnell fahren wir?“"
      : "Sorry, something just went wrong — I can't quite think right now. Try again in a moment, or ask me about the ride, for example: “How fast are we going?”",
  };
}

export function cannedReply(
  raw: string,
  lang: Locale,
  telemetry: MonoCabTelemetry,
): CannedResult {
  const t = raw.toLowerCase();
  const de = lang === "de";
  const next = telemetry.nextStops[0];

  // Greeting
  if (has(t, "hallo", "hi", "hello", "guten tag", "hey")) {
    return {
      matched: true,
      emotion: "happy",
      text: de
        ? "Hallo! Ich bin CoSiMo. Wie kann ich dir auf dieser Fahrt helfen?"
        : "Hello! I'm CoSiMo. How can I help you on this ride?",
    };
  }

  // Light on/off
  if (has(t, "licht aus", "light off", "schalte das licht aus", "turn off")) {
    return {
      matched: true,
      emotion: "neutral",
      cabin: { control: "interior-light", on: false },
      text: de ? "Ich schalte das Licht aus." : "Turning the light off.",
    };
  }
  if (has(t, "licht", "light", "lampe", "lamp")) {
    return {
      matched: true,
      emotion: "happy",
      cabin: { control: "interior-light", on: true },
      text: de ? "Ich schalte das Licht an." : "Turning the light on.",
    };
  }

  // Speed
  if (has(t, "schnell", "tempo", "speed", "fast", "km/h", "geschwindigkeit")) {
    return {
      matched: true,
      emotion: "neutral",
      text: de
        ? `Wir fahren gerade ${Math.round(telemetry.speedKmh)} km/h.`
        : `We're going ${Math.round(telemetry.speedKmh)} km/h right now.`,
    };
  }

  // Arrival / next stop
  if (has(t, "wann", "ankommen", "ankunft", "halt", "station", "arrive", "next stop", "when")) {
    if (next) {
      return {
        matched: true,
        emotion: "neutral",
        text: de
          ? `Nächster Halt ist ${next.name.de} in etwa ${next.etaMinutes} Minuten.`
          : `The next stop is ${next.name.en} in about ${next.etaMinutes} minutes.`,
      };
    }
    return {
      matched: true,
      emotion: "neutral",
      text: de
        ? `Wir fahren nach ${telemetry.destination.de}.`
        : `We're heading to ${telemetry.destination.en}.`,
    };
  }

  // Where are we
  if (has(t, "wo sind", "where are", "standort", "location", "wo wir")) {
    return {
      matched: true,
      emotion: "neutral",
      text: de
        ? `Wir sind ${telemetry.location.de}, auf der ${telemetry.line.de}.`
        : `We're ${telemetry.location.en}, on the ${telemetry.line.en}.`,
    };
  }

  // Occupancy
  if (has(t, "voll", "besetzt", "wie viele", "occupancy", "how many", "busy")) {
    return {
      matched: true,
      emotion: "neutral",
      text: de
        ? `Gerade sind ${telemetry.occupancy} von ${telemetry.capacity} Plätzen belegt.`
        : `Right now ${telemetry.occupancy} of ${telemetry.capacity} seats are taken.`,
    };
  }


  // Thanks
  if (has(t, "danke", "thanks", "thank you")) {
    return {
      matched: true,
      emotion: "happy",
      text: de ? "Gern geschehen!" : "You're very welcome!",
    };
  }

  // Help
  if (has(t, "was kannst du", "hilfe", "help", "what can you")) {
    return {
      matched: true,
      emotion: "happy",
      text: de
        ? "Ich kann dir zur Fahrt Auskunft geben und das Licht im Abteil steuern. Frag mich zum Beispiel: Wie schnell fahren wir?"
        : "I can tell you about the ride and control the cabin light. Try asking: How fast are we going?",
    };
  }

  // Not understood → friendly fallback with suggestions
  const tips = SUGGESTIONS[lang].map((s) => `„${s}“`).join(", ");
  return {
    matched: false,
    emotion: "neutral",
    text: de
      ? `Das habe ich nicht ganz verstanden. Du kannst zum Beispiel fragen: ${tips}.`
      : `I didn't quite catch that. You could ask, for example: ${tips}.`,
  };
}
