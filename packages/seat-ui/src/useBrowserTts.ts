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
  setSpeaking,
}: {
  /** False when server TTS plays the reply or the profile wants no audio. */
  enabled: boolean;
  reply: string;
  replying: boolean;
  pttActive: boolean;
  lang: Locale;
  rate: number;
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
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [enabled, replying, reply, pttActive, lang, rate, setSpeaking]);
}
