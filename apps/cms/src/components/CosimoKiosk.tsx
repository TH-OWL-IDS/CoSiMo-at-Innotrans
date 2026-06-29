"use client";

import { useState } from "react";
import type { Locale, PipelinePhase } from "@cosimo/shared";
import CosimoFaceAnimated from "./CosimoFaceAnimated";
import { useCosimoSocket } from "./useCosimoSocket";

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    cosimo.send(text, lang);
    setDraft("");
  };

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
      }}
    >
      <div style={{ position: "fixed", top: 12, right: 16, fontSize: 12, opacity: 0.5 }}>
        {cosimo.connected ? "● live" : "○ offline"}
        {cosimo.status && !cosimo.status.llm ? " · no LLM key" : ""}
      </div>

      <CosimoFaceAnimated
        emotion={cosimo.emotion}
        style={{ width: "min(60vw, 360px)", height: "auto", color: "var(--ink)" }}
      />

      <div style={{ fontSize: 14, letterSpacing: 1, textTransform: "uppercase", opacity: 0.55 }}>
        {PHASE_LABEL[cosimo.phase][lang]}
      </div>

      <p
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
