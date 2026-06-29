"use client";

import type { Locale } from "@cosimo/shared";

/**
 * GDPR consent gate. Shown before the conversation starts at a public German
 * trade fair: CoSiMo records interactions as structured text (never audio) for
 * research. The visitor must choose; the decision is sent to the server and
 * stored on the session. Decline still lets them talk — it just isn't recorded.
 */
export default function ConsentOverlay({
  lang,
  onDecide,
  onToggleLang,
}: {
  lang: Locale;
  onDecide: (consent: boolean) => void;
  onToggleLang: () => void;
}) {
  const t = (de: string, en: string) => (lang === "de" ? de : en);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Datenschutz-Hinweis", "Privacy notice")}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        color: "var(--ink)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "2rem",
        textAlign: "center",
        zIndex: 50,
      }}
    >
      <button
        type="button"
        onClick={onToggleLang}
        style={{ position: "fixed", top: 16, right: 16, padding: "6px 14px", borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}
      >
        {lang.toUpperCase()}
      </button>

      <h1 style={{ fontSize: "2rem", margin: 0 }}>CoSiMo</h1>
      <p style={{ maxWidth: "34rem", fontSize: "1.15rem", lineHeight: 1.5, margin: 0 }}>
        {t(
          "CoSiMo begleitet dich auf dieser Fahrt. Für unsere Forschung speichern wir den Gesprächsverlauf als Text – niemals als Audioaufnahme. Bist du einverstanden?",
          "CoSiMo will accompany you on this ride. For our research we record the conversation as text — never as an audio recording. Is that OK with you?",
        )}
      </p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => onDecide(true)}
          style={{ minHeight: 56, padding: "0 28px", fontSize: "1.1rem", fontWeight: 600, borderRadius: 14, border: "none", background: "var(--ink)", color: "var(--bg)", cursor: "pointer" }}
        >
          {t("Einverstanden", "I agree")}
        </button>
        <button
          type="button"
          onClick={() => onDecide(false)}
          style={{ minHeight: 56, padding: "0 28px", fontSize: "1.1rem", borderRadius: 14, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}
        >
          {t("Ohne Aufzeichnung fortfahren", "Continue without recording")}
        </button>
      </div>

      <p style={{ maxWidth: "30rem", fontSize: "0.85rem", opacity: 0.6, margin: 0 }}>
        {t(
          "Keine Audiodaten. Keine personenbezogenen Daten ohne deine Zustimmung. Du kannst jederzeit aufhören.",
          "No audio data. No personal data without your consent. You can stop at any time.",
        )}
      </p>
    </div>
  );
}
