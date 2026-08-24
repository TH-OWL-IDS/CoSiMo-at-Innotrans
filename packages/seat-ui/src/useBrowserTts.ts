import { useEffect, useRef } from "react";
import type { Locale } from "@cosimo/shared";

/**
 * Browser speech-synthesis fallback: when the server has no TTS configured,
 * speak each finished reply locally. Flips the shared `speaking` flag from
 * the synthesis callbacks so the face's mouth still follows real playback.
 *
 * Barge-in: while the rider holds the talk button the reply is never
 * (re)started — and the partial text is marked as spoken so it stays silent
 * in the release→new-turn gap too.
 */
export function useBrowserTts({
  enabled,
  reply,
  replying,
  pttActive,
  lang,
  rate,
  volume,
  gender,
  setSpeaking,
}: {
  /** False when server TTS plays the reply or the profile wants no audio. */
  enabled: boolean;
  reply: string;
  replying: boolean;
  pttActive: boolean;
  lang: Locale;
  rate: number;
  /** Playback volume 0–1. */
  volume: number;
  /** Preferred voice gender — best-effort against the installed system voices. */
  gender: "female" | "male";
  setSpeaking: (on: boolean) => void;
}): void {
  const spokenRef = useRef("");
  useEffect(() => {
    if (!enabled || replying) return;
    const text = reply.trim();
    if (pttActive) {
      spokenRef.current = text;
      return;
    }
    if (!text || text === spokenRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    spokenRef.current = text;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "de" ? "de-DE" : "en-US";
    u.rate = rate;
    u.volume = Math.max(0, Math.min(1, volume));
    // Best-effort gender: system voice names are the only signal the Web
    // Speech API offers. No match → the default voice speaks (never silent).
    if (gender === "male") {
      const wanted = lang === "de" ? "de" : "en";
      const male = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase().startsWith(wanted) && /male|man|männlich|daniel|markus|stefan|fred|yannick/i.test(v.name) && !/female|woman|weiblich/i.test(v.name));
      if (male) u.voice = male;
    }
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [enabled, replying, reply, pttActive, lang, rate, volume, gender, setSpeaking]);
}
