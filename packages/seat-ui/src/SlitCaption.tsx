import type { Locale, MonoCabTelemetry } from "@cosimo/shared";

/**
 * Subtitle: the sentence CoSiMo is speaking right now (clips arrive per
 * sentence, so this is in step with the voice), large, up to two lines;
 * beneath it the next stop stays as the quiet small line. After the reply
 * the last sentence stands for a while with the ↻ affordance beside it.
 */
export default function SlitCaption({
  text,
  telemetry,
  lang,
  textScale,
  aside,
}: {
  text: string;
  telemetry: MonoCabTelemetry | null;
  lang: Locale;
  textScale: number;
  /** Rendered at the right edge (the ↻ affordance after a reply). */
  aside?: React.ReactNode;
}) {
  const next = telemetry?.nextStops[0];
  const small = next ? `${lang === "de" ? "nächster Halt" : "next stop"} · ${next.name[lang]} · ${next.etaMinutes} min` : "";
  return (
    <div
      aria-live="polite"
      style={{
        width: "100%", height: "100%", boxSizing: "border-box",
        display: "flex", alignItems: "center", gap: "4cqh",
        padding: "5cqh 7cqh",
        overflow: "hidden",
        animation: "slit-in 220ms ease-out",
      }}
    >
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3cqh" }}>
        <span
          style={{
            fontSize: `clamp(13px, ${24 * textScale}cqh, ${56 * textScale}px)`, fontWeight: 600, lineHeight: 1.12,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >
          {text}
        </span>
        {small && (
          <span style={{ fontSize: "clamp(10px, 14cqh, 30px)", fontWeight: 500, opacity: 0.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {small}
          </span>
        )}
      </div>
      {aside && <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{aside}</div>}
    </div>
  );
}
