"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale, PersonaKey, PipelinePhase } from "@cosimo/shared";
import CosimoFaceAnimated from "./CosimoFaceAnimated";
import CabinPanel from "./CabinPanel";
import PushToTalk from "./PushToTalk";
import TelemetryStrip from "./TelemetryStrip";
import ConsentOverlay from "./ConsentOverlay";
import { schemeById } from "../appearance/schemes";
import { useCosimoSocket } from "./useCosimoSocket";

/** Suggested phrases to help riders start (and recover a misunderstanding). */
const SUGGESTIONS: Record<Locale, string[]> = {
  de: ["Wie schnell fahren wir?", "Wann kommen wir an?", "Mach das Licht an"],
  en: ["How fast are we going?", "When do we arrive?", "Turn on the light"],
};

/** Persona options for the switcher (full set lives in the CMS / host console). */
const PERSONA_OPTIONS: { key: PersonaKey; de: string; en: string }[] = [
  { key: "default", de: "Standard", en: "Default" },
  { key: "eyes-free", de: "Ohne Sicht", en: "Eyes-free" },
  { key: "wheelchair", de: "Rollstuhl", en: "Wheelchair" },
  { key: "text-first", de: "Text", en: "Text-first" },
];

const PHASE_LABEL: Record<PipelinePhase, Record<Locale, string>> = {
  idle: { de: "Bereit", en: "Ready" },
  listening: { de: "Hört zu …", en: "Listening …" },
  thinking: { de: "Denkt nach …", en: "Thinking …" },
  speaking: { de: "Spricht …", en: "Speaking …" },
};

const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";

/**
 * Phase 1.5 kiosk view: CoSiMo's animated Face reacting live to the realtime
 * service, the conversation phase, the streaming reply, and an always-available
 * text-fallback input. Voice (push-to-talk) arrives in Phase 4; the full
 * accessible UX in Phase 5.
 */
export default function CosimoKiosk() {
  const cosimo = useCosimoSocket(REALTIME_URL);
  const [lang, setLang] = useState<Locale>("de");
  const [draft, setDraft] = useState("");
  const [consentDecided, setConsentDecided] = useState(false);

  const decideConsent = (consent: boolean) => {
    cosimo.setConsent(consent);
    setConsentDecided(true);
  };

  // Host reset → return to the welcome/consent screen for the next visitor.
  useEffect(() => {
    if (cosimo.resetNonce > 0) {
      setConsentDecided(false);
      setDraft("");
    }
  }, [cosimo.resetNonce]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    cosimo.send(text, lang);
    setDraft("");
  };

  // Persona drives the theme + accessible presentation, live.
  const scheme = schemeById(cosimo.persona?.themeId ?? "classic");
  const largeText = cosimo.persona?.presentation.largeText ?? false;
  const speakAloud = cosimo.persona?.presentation.speakAloud ?? true;
  const activeKey = cosimo.persona?.persona ?? "default";
  const serverStt = cosimo.status?.serverStt ?? false;
  const serverTts = cosimo.status?.serverTts ?? false;

  // Browser TTS: when there is no server TTS, speak the reply once it finishes.
  const spokenRef = useRef("");
  useEffect(() => {
    if (serverTts || !speakAloud || cosimo.replying) return;
    const text = cosimo.reply.trim();
    if (!text || text === spokenRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    spokenRef.current = text;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "de" ? "de-DE" : "en-US";
    // Drive the Face's mouth from the actual browser speech, in sync.
    u.onstart = () => cosimo.setSpeaking(true);
    u.onend = () => cosimo.setSpeaking(false);
    u.onerror = () => cosimo.setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [cosimo.replying, cosimo.reply, serverTts, speakAloud, lang, cosimo.setSpeaking]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "2rem",
        textAlign: "center",
        background: scheme.bg,
        color: scheme.ink,
        fontSize: largeText ? "1.2rem" : "1rem",
        transition: "background 300ms, color 300ms",
        // CSS vars consumed by the Face (currentColor) and inputs.
        ["--bg" as string]: scheme.bg,
        ["--ink" as string]: scheme.ink,
      }}
    >
      {!consentDecided && (
        <ConsentOverlay
          lang={lang}
          onDecide={decideConsent}
          onToggleLang={() => setLang((l) => (l === "de" ? "en" : "de"))}
        />
      )}

      {/* Reconnect banner — socket.io retries automatically. */}
      {!cosimo.connected && (
        <div
          role="status"
          style={{ position: "fixed", top: 0, left: 0, right: 0, padding: "6px", textAlign: "center", fontSize: 13, background: scheme.ink, color: scheme.bg, zIndex: 40 }}
        >
          {lang === "de" ? "Verbindung wird wiederhergestellt …" : "Reconnecting …"}
        </div>
      )}

      <div style={{ position: "fixed", top: 12, right: 16, fontSize: 12, opacity: 0.5 }}>
        {cosimo.connected ? "● live" : "○ offline"}
        {cosimo.status?.offlineCanned ? (lang === "de" ? " · Demo-Modus" : " · demo mode") : ""}
        {cosimo.status && !cosimo.status.llm ? (lang === "de" ? " · kein KI-Schlüssel" : " · no LLM key") : ""}
      </div>

      <TelemetryStrip telemetry={cosimo.telemetry} lang={lang} />

      {/* Persona switcher (seed of the host console — Phase 7). */}
      <div style={{ position: "fixed", top: 10, left: 12, display: "flex", gap: 6 }}>
        {PERSONA_OPTIONS.map((o) => {
          const active = o.key === activeKey;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => cosimo.setPersona(o.key)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 999,
                cursor: "pointer",
                border: "1px solid currentColor",
                background: active ? scheme.ink : "transparent",
                color: active ? scheme.bg : "inherit",
                opacity: active ? 1 : 0.6,
              }}
            >
              {lang === "de" ? o.de : o.en}
            </button>
          );
        })}
      </div>

      <CosimoFaceAnimated
        emotion={cosimo.faceEmotion}
        style={{ width: "min(60vw, 360px)", height: "auto", color: "var(--ink)" }}
      />

      <div
        role="status"
        aria-live="polite"
        style={{ fontSize: 14, letterSpacing: 1, textTransform: "uppercase", opacity: 0.55 }}
      >
        {PHASE_LABEL[cosimo.phase][lang]}
      </div>

      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          minHeight: "3.5rem",
          maxWidth: "40rem",
          fontSize: "1.4rem",
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {cosimo.reply}
        {cosimo.replying ? " ▍" : ""}
      </p>

      <CabinPanel cabin={cosimo.cabin} lang={lang} />

      {/* Suggested phrases — help riders start and recover from misunderstandings. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {SUGGESTIONS[lang].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => cosimo.send(s, lang)}
            style={{ padding: "6px 14px", fontSize: 13, borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", opacity: 0.7, cursor: "pointer" }}
          >
            {s}
          </button>
        ))}
      </div>

      {cosimo.heard && (
        <div style={{ fontSize: 13, opacity: 0.5, fontStyle: "italic" }}>
          {lang === "de" ? "Gehört" : "Heard"}: “{cosimo.heard}”
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <PushToTalk
          serverStt={serverStt}
          lang={lang}
          onStart={cosimo.pttStart}
          onStop={cosimo.pttStop}
          onUtterance={cosimo.sendUtterance}
          onTranscript={(t, l) => cosimo.send(t, l, "voice")}
        />
        <span style={{ fontSize: 12, opacity: 0.5 }}>
          {lang === "de" ? "halten & sprechen" : "hold & talk"}
        </span>
      </div>

      <form onSubmit={submit} style={{ display: "flex", gap: 8, width: "min(90vw, 36rem)" }}>
        <button
          type="button"
          onClick={() => setLang((l) => (l === "de" ? "en" : "de"))}
          style={{ padding: "0 14px", borderRadius: 10, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}
          aria-label="Sprache wechseln"
        >
          {lang.toUpperCase()}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={lang === "de" ? "Schreib CoSiMo …" : "Type to CoSiMo …"}
          style={{
            flex: 1,
            padding: "12px 16px",
            fontSize: "1.1rem",
            borderRadius: 12,
            border: "1px solid currentColor",
            background: "transparent",
            color: "inherit",
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        />
        <button
          type="submit"
          style={{ padding: "0 18px", borderRadius: 12, border: "none", background: "var(--ink)", color: "var(--bg)", cursor: "pointer", fontWeight: 600 }}
        >
          {lang === "de" ? "Senden" : "Send"}
        </button>
      </form>
    </main>
  );
}
