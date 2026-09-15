import type { Locale, MonoCabTelemetry } from "@cosimo/shared";

/**
 * The slit at rest — a destination board, one statement: the next stop
 * large, beneath it in small type how far and whether on time (a fault or
 * delay takes that line). No clock, no head count, no speed: nothing the
 * rider would not look for here. `hint` swaps the small line for the
 * talk-button invitation after a while without contact.
 */
export default function TelemetryStrip({
  telemetry,
  lang,
  hint,
}: {
  telemetry: MonoCabTelemetry | null;
  lang: Locale;
  hint?: string | null;
}) {
  const de = lang === "de";
  const next = telemetry?.nextStops[0];
  const fault = telemetry?.faults?.[0];
  const delay = telemetry?.delayMinutes ?? 0;
  const big = next ? next.name[lang] : telemetry ? telemetry.location[lang] : "MonoCab";
  const small = hint
    ? hint
    : fault
      ? `${fault.cause[lang]}${delay ? ` · +${delay} min` : ""}`
      : next
        ? `${de ? "nächster Halt" : "next stop"} · ${next.etaMinutes} min · ${delay ? `+${delay} min` : de ? "pünktlich" : "on time"}`
        : de ? "unterwegs" : "en route";

  return (
    <div
      aria-label={de ? "Fahrtinformation" : "Journey information"}
      style={{
        width: "100%", height: "100%", boxSizing: "border-box",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: "3cqh",
        padding: "6cqh var(--slit-inset, 7cqh)",
        whiteSpace: "nowrap", overflow: "hidden",
        animation: "slit-in 300ms ease-out",
      }}
    >
      {/* long names ("Barntrup Hauptstation") shrink to fit the width left between
          the rounded ends (~386cqh of a 110×24 mm slit) instead of ellipsing */}
      <span style={{ fontSize: `clamp(14px, ${Math.min(34, 380 / (Math.max(1, big.length) * 0.6)).toFixed(1)}cqh, 72px)`, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis" }}>
        {big}
      </span>
      <span style={{ fontSize: "clamp(11px, 17cqh, 36px)", fontWeight: 500, lineHeight: 1.1, opacity: hint ? 0.9 : 0.62, overflow: "hidden", textOverflow: "ellipsis", transition: "opacity 300ms" }}>
        {small}
      </span>
    </div>
  );
}
