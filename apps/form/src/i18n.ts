import type { Locale } from "@cosimo/shared";

/**
 * The page's own strings (the items come from @cosimo/shared survey.ts).
 * Visitor-facing, so German first, English beside it. The privacy notice is
 * the Art. 13 text shown before the consent box; CONTACT adds a contact
 * line when set (empty = no line, decided 2026-09-20).
 */

/** The contact address for data-protection questions. Empty = no contact line. */
export const CONTACT = "";
export const CONTROLLER = "Institute for Design Strategies (IDS), Technische Hochschule Ostwestfalen-Lippe";

export const STRINGS = {
  de: {
    title: "Wie war es mit CoSiMo?",
    intro: "Du hast gerade CoSiMo im MonoCab ausprobiert. Neun kurze Fragen helfen uns, es besser zu machen. Es dauert etwa zwei Minuten, ist anonym und freiwillig.",
    lang: "Sprache",
    scaleHint: "Tippe auf die Zahl, die am besten passt: 1 = links, 7 = rechts.",
    agreeHint: "1 = Stimme überhaupt nicht zu · 7 = Stimme voll und ganz zu",
    of: "von",
    progress: (n: number, total: number) => `${n} von ${total} beantwortet`,
    privacyTitle: "Datenschutz",
    privacy: [
      `Verantwortlich: ${CONTROLLER}.`,
      "Zweck: wissenschaftliche Auswertung des Demonstrators CoSiMo.",
      "Gespeichert werden nur deine Antworten (Zahlen 1 bis 7), die gewählte Sprache und der Zeitpunkt. Keine IP-Adresse, kein Gerät, kein Name, keine Verbindung zu deinem Gespräch mit CoSiMo.",
      "Weil nichts auf dich zurückführt, können wir eine Antwort nach dem Absenden nicht mehr zuordnen und deshalb auch nicht mehr löschen.",
      ...(CONTACT ? [`Fragen: ${CONTACT}`] : []),
    ],
    consent: "Ich bin einverstanden, dass meine Antworten anonym für Forschungszwecke ausgewertet werden.",
    submit: "Absenden",
    sending: "Wird gesendet …",
    missingTitle: "Da fehlt noch etwas",
    missing: (n: number) => (n === 1 ? "Eine Frage ist noch unbeantwortet." : `${n} Fragen sind noch unbeantwortet.`),
    missingConsent: "Bitte bestätige die Einwilligung.",
    jump: "Zur Frage",
    errorTitle: "Das hat nicht geklappt",
    errorNetwork: "Deine Antworten sind noch hier. Bitte versuche es gleich nochmal — oder lass die Seite offen, wir versuchen es automatisch.",
    errorRejected: "Der Server hat die Antwort nicht angenommen. Bitte lade die Seite neu und versuche es erneut.",
    retry: "Nochmal senden",
    thanksTitle: "Danke!",
    thanks: "Deine Antworten sind angekommen. Gute Fahrt!",
    alreadyTitle: "Schon erledigt",
    already: "Aus diesem Browser-Tab wurde der Fragebogen bereits abgeschickt. Danke!",
    version: "Fragebogen",
    itemLabel: (n: number) => `Frage ${n}`,
  },
  en: {
    title: "How was CoSiMo?",
    intro: "You just tried CoSiMo in the MonoCab. Nine short questions help us make it better. It takes about two minutes, is anonymous and voluntary.",
    lang: "Language",
    scaleHint: "Tap the number that fits best: 1 = left, 7 = right.",
    agreeHint: "1 = Strongly disagree · 7 = Strongly agree",
    of: "of",
    progress: (n: number, total: number) => `${n} of ${total} answered`,
    privacyTitle: "Privacy",
    privacy: [
      `Controller: ${CONTROLLER}.`,
      "Purpose: scientific evaluation of the CoSiMo demonstrator.",
      "We store only your answers (numbers 1 to 7), the chosen language and the time. No IP address, no device, no name, no link to your conversation with CoSiMo.",
      "Because nothing points back to you, we cannot attribute a response after it is sent and therefore cannot delete it either.",
      ...(CONTACT ? [`Questions: ${CONTACT}`] : []),
    ],
    consent: "I agree that my answers are evaluated anonymously for research purposes.",
    submit: "Submit",
    sending: "Sending …",
    missingTitle: "Something is missing",
    missing: (n: number) => (n === 1 ? "One question is still unanswered." : `${n} questions are still unanswered.`),
    missingConsent: "Please confirm your consent.",
    jump: "Go to question",
    errorTitle: "That didn't work",
    errorNetwork: "Your answers are still here. Please try again in a moment — or leave the page open, we retry automatically.",
    errorRejected: "The server did not accept the response. Please reload the page and try again.",
    retry: "Send again",
    thanksTitle: "Thank you!",
    thanks: "Your answers have arrived. Enjoy the ride!",
    alreadyTitle: "Already done",
    already: "This questionnaire has already been submitted from this browser tab. Thank you!",
    version: "Questionnaire",
    itemLabel: (n: number) => `Question ${n}`,
  },
} satisfies Record<Locale, unknown>;

export type Strings = (typeof STRINGS)["de"];
