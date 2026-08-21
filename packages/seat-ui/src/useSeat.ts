import { useEffect, useState } from "react";
import type { Locale } from "@cosimo/shared";
import { schemeById, type ColorScheme } from "@cosimo/face";
import { useCosimoSocket, type CosimoState } from "@cosimo/client";
import { usePushToTalk } from "./usePushToTalk.js";
import { useBrowserTts } from "./useBrowserTts.js";

/** Everything a seat renderer needs, derived once from the live socket state. */
export interface Seat {
  cosimo: CosimoState;
  lang: Locale;
  setLang: (lang: Locale) => void;
  toggleLang: () => void;
  consentDecided: boolean;
  decideConsent: (consent: boolean) => void;
  /** The active profile's accommodations, resolved to render-ready values. */
  scheme: ColorScheme;
  textScale: number;
  highContrast: boolean;
  showText: boolean;
  reduceMotion: boolean;
  /** Push-to-talk lifecycle — driven by a physical button or an on-screen one. */
  ptt: { active: boolean; supported: boolean; start: () => void; stop: () => void };
  /** The canned intro question (the physical "info" button). */
  askInfo: () => void;
}

/**
 * A seat's behaviour, independent of what drives it. The native app feeds it
 * HID keystrokes; the browser emulator feeds it on-screen buttons. Both get
 * the same language resolution, consent flow, accommodation mapping,
 * push-to-talk and TTS fallback — so "works in the emulator" means something.
 */
export function useSeat(serverUrl: string): Seat {
  const cosimo = useCosimoSocket(serverUrl);
  const [lang, setLang] = useState<Locale>("de");
  const [consentDecided, setConsentDecided] = useState(false);

  const decideConsent = (consent: boolean) => {
    cosimo.setConsent(consent);
    setConsentDecided(true);
  };

  // Host reset → return to the consent screen for the next visitor.
  useEffect(() => {
    if (cosimo.resetNonce > 0) setConsentDecided(false);
  }, [cosimo.resetNonce]);

  // The active profile's preferred language becomes the seat's UI language
  // (e.g. an NFC scan loads an English-speaking rider). The visitor can still
  // toggle manually afterwards.
  const profileLang = cosimo.persona?.accommodations.language;
  useEffect(() => {
    if (profileLang) setLang(profileLang);
  }, [profileLang]);

  // Profile accommodations drive the theme + accessible presentation, live —
  // all voice-mutable via CoSiMo (set_presentation).
  const acc = cosimo.persona?.accommodations;
  const scheme = schemeById(acc?.theme ?? "classic");
  const textScale = { s: 0.85, m: 1, l: 1.25, xl: 1.55 }[acc?.textSize ?? "m"];
  const highContrast = acc?.contrast === "high";
  const showText = acc?.showText ?? false;
  const speakAloud = acc?.audioOutput ?? true;
  const speechRate = acc?.speechRate ?? 1;
  const reduceMotion = acc?.reduceMotion ?? false;
  const serverStt = cosimo.status?.serverStt ?? false;
  const serverTts = cosimo.status?.serverTts ?? false;

  const ptt = usePushToTalk({
    serverStt,
    lang,
    onStart: cosimo.pttStart,
    onStop: cosimo.pttStop,
    onUtterance: cosimo.sendUtterance,
    onTranscript: (t, l) => cosimo.send(t, l, "voice"),
  });

  // Voice input needs server STT (Deepgram) or Chrome's speech recognition.
  // Say so loudly in dev instead of leaving the talk button silently dead.
  const pttSupported = ptt.supported;
  useEffect(() => {
    if (consentDecided && !pttSupported) {
      // eslint-disable-next-line no-console
      console.warn(
        "[cosimo-seat] push-to-talk unavailable: no server STT (DEEPGRAM_API_KEY) and this browser has no SpeechRecognition (use Chrome for the dev fallback).",
      );
    }
  }, [consentDecided, pttSupported]);

  useBrowserTts({
    enabled: !serverTts && speakAloud,
    reply: cosimo.reply,
    replying: cosimo.replying,
    pttActive: ptt.active,
    lang,
    rate: speechRate,
    setSpeaking: cosimo.setSpeaking,
  });

  const askInfo = () =>
    cosimo.send(
      lang === "de"
        ? "Was kannst du und wie hilfst du mir hier im MonoCab?"
        : "What can you do and how can you help me here in the MonoCab?",
      lang,
    );

  return {
    cosimo,
    lang,
    setLang,
    toggleLang: () => setLang((l) => (l === "de" ? "en" : "de")),
    consentDecided,
    decideConsent,
    scheme,
    textScale,
    highContrast,
    showText,
    reduceMotion,
    ptt,
    askInfo,
  };
}
