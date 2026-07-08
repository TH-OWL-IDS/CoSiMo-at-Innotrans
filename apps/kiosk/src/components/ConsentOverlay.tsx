import type { Locale } from "@cosimo/shared";

/**
 * GDPR consent gate, sized for the circular panel cutout — the only screen
 * area the visitor can see and touch. Kept compact: everything must fit
 * inside the circle. CoSiMo records interactions as structured text (never
 * audio) for research; decline still lets them talk, it just isn't recorded.
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
        position: "absolute",
        inset: 0,
        background: "var(--bg)",
        color: "var(--ink)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4%",
        // Generous inset keeps everything inside the circular cutout.
        padding: "16% 14%",
        textAlign: "center",
        zIndex: 50,
      }}
    >
      <h1 style={{ fontSize: "clamp(18px, 5.5vw, 34px)", margin: 0 }}>CoSiMo</h1>
      <p style={{ fontSize: "clamp(12px, 3.4vw, 19px)", lineHeight: 1.45, margin: 0 }}>
        {t(
          "CoSiMo begleitet dich auf dieser Fahrt. Für unsere Forschung speichern wir den Gesprächsverlauf als Text – niemals als Audioaufnahme. Bist du einverstanden?",
          "CoSiMo will accompany you on this ride. For our research we record the conversation as text — never as an audio recording. Is that OK with you?",
        )}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "80%" }}>
        <button
          type="button"
          onClick={() => onDecide(true)}
          style={{
            minHeight: 52,
            fontSize: "clamp(14px, 3.6vw, 19px)",
            fontWeight: 600,
            borderRadius: 999,
            border: "none",
            background: "var(--ink)",
            color: "var(--bg)",
            cursor: "pointer",
          }}
        >
          {t("Einverstanden", "I agree")}
        </button>
        <button
          type="button"
          onClick={() => onDecide(false)}
          style={{
            minHeight: 44,
            fontSize: "clamp(12px, 3vw, 16px)",
            borderRadius: 999,
            border: "1px solid currentColor",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          {t("Ohne Aufzeichnung fortfahren", "Continue without recording")}
        </button>
        <button
          type="button"
          onClick={onToggleLang}
          style={{
            alignSelf: "center",
            padding: "6px 16px",
            borderRadius: 999,
            border: "1px solid currentColor",
            background: "transparent",
            color: "inherit",
            opacity: 0.6,
            cursor: "pointer",
            fontSize: "clamp(11px, 2.6vw, 14px)",
          }}
        >
          {lang === "de" ? "EN" : "DE"}
        </button>
      </div>
    </div>
  );
}
