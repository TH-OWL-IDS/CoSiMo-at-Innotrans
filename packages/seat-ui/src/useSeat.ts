import { useEffect, useRef, useState } from "react";
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
  ptt: { active: boolean; supported: boolean; start: () => void; stop: () => void; error: string | null };
  /** The canned intro question (the physical "info" button). */
  askInfo: () => void;
}

/**
 * A seat's behaviour, independent of what drives it. The native app feeds it
 * HID keystrokes; the browser emulator feeds it on-screen buttons. Both get
 * the same language resolution, consent flow, accommodation mapping,
 * push-to-talk and TTS fallback — so "works in the emulator" means something.
 */
const CONSENT_KEY = "cosimo.consent";
function storedConsent(): boolean | null {
  try {
    const v = sessionStorage.getItem(CONSENT_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}
function rememberConsent(v: boolean | null): void {
  try {
    if (v === null) sessionStorage.removeItem(CONSENT_KEY);
    else sessionStorage.setItem(CONSENT_KEY, v ? "1" : "0");
  } catch {
    // private mode — the decision just won't survive a reload
  }
}

export function useSeat(serverUrl: string, kind: "kiosk" | "emulator" = "kiosk"): Seat {
  const cosimo = useCosimoSocket(serverUrl, "kiosk", kind);
  const [lang, setLang] = useState<Locale>("de");
  // The decision survives a reload of this tab (sessionStorage, like the
  // device + session ids): a reloaded emulator lands in the conversation,
  // not on the consent screen. The hub keeps the seat's state meanwhile.
  const [consentDecided, setConsentDecided] = useState(() => storedConsent() !== null);

  const decideConsent = (consent: boolean) => {
    cosimo.setConsent(consent);
    rememberConsent(consent);
    setConsentDecided(true);
  };

  // After a reload: tell the (possibly new) hub entry the remembered decision
  // once the socket is up. Idempotent on the hub.
  const resent = useRef(false);
  useEffect(() => {
    const kept = storedConsent();
    if (!cosimo.connected || kept === null || resent.current) return;
    resent.current = true;
    cosimo.setConsent(kept);
  }, [cosimo.connected]);

  // A new session (persona switch, host reset): back to the consent screen —
  // unless the hub handed us a card rider's STORED decision, which applies
  // at every login without asking again.
  useEffect(() => {
    if (cosimo.resetNonce > 0) {
      const stored = cosimo.lastReset?.consent ?? null;
      rememberConsent(stored);
      resent.current = false;
      setConsentDecided(stored !== null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const scheme = schemeById(acc?.theme ?? "weiss");
  const textScale = { s: 0.85, m: 1, l: 1.25, xl: 1.55 }[acc?.textSize ?? "m"];
  const highContrast = acc?.contrast === "high";
  const showText = acc?.showText ?? false;
  const speakAloud = acc?.audioOutput ?? true;
  const speechRate = acc?.speechRate ?? 1;
  const volume = acc?.volume ?? 1;
  const voiceGender = acc?.voiceGender ?? "female";
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
    volume,
    gender: voiceGender,
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
