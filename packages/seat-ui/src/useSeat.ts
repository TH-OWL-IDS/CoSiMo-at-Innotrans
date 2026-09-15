import { useEffect, useRef, useState } from "react";
import { TEXT_SCALE, normalizeTextSize, type Locale } from "@cosimo/shared";
import { schemeById, type ColorScheme } from "@cosimo/face";
import { useCosimoSocket, type CosimoState } from "@cosimo/client";
import { usePushToTalk, type NativeDictation } from "./usePushToTalk.js";
import { useBrowserTts } from "./useBrowserTts.js";

/** Everything a seat renderer needs, derived once from the live socket state. */
export interface Seat {
  cosimo: CosimoState;
  lang: Locale;
  setLang: (lang: Locale) => void;
  toggleLang: () => void;
  /** The active profile's accommodations, resolved to render-ready values. */
  scheme: ColorScheme;
  textScale: number;
  showText: boolean;
  reduceMotion: boolean;
  /** Push-to-talk lifecycle — driven by a physical button or an on-screen one. */
  ptt: { active: boolean; supported: boolean; start: () => void; stop: () => void; error: string | null; partial: string; wave: { kind: () => "audio" | "native" | null; sample: (out: Float32Array) => boolean } };
  /** The canned intro question (the physical "info" button). */
  askInfo: () => void;
}

/**
 * A seat's behaviour, independent of what drives it. The native app feeds it
 * HID keystrokes; the browser emulator feeds it on-screen buttons. Both get
 * the same language resolution, accommodation mapping,
 * push-to-talk and TTS fallback — so "works in the emulator" means something.
 */
export function useSeat(
  serverUrl: string,
  kind: "kiosk" | "emulator" = "kiosk",
  opts?: {
    /** Native dictation (Apple SFSpeechRecognizer), injected by the iPad app. */
    nativeStt?: NativeDictation | null;
    /** Physical seat position 1-4 (kiosk operator setting). */
    seat?: number;
    /** Silent showcase mode (kiosk operator setting). */
    showcase?: boolean;
  },
): Seat {
  const cosimo = useCosimoSocket(serverUrl, "kiosk", kind, undefined, opts?.seat, opts?.showcase);
  const [lang, setLang] = useState<Locale>("de");
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
  // "l" (1.0) is the slit's full size — the setting only goes smaller.
  const textScale = TEXT_SCALE[normalizeTextSize(acc?.textSize)];
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
    nativeStt: opts?.nativeStt,
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
    if (!pttSupported) {
      // eslint-disable-next-line no-console
      console.warn(
        "[cosimo-seat] push-to-talk unavailable: no server STT (DEEPGRAM_API_KEY), no native dictation, and this browser has no SpeechRecognition (use Chrome for the dev fallback).",
      );
    }
  }, [pttSupported]);

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
    scheme,
    textScale,
    showText,
    reduceMotion,
    ptt,
    askInfo,
  };
}
