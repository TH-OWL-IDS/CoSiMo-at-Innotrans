import { useEffect, useState } from "react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";

/**
 * Slit telemetry strip — the narrow horizontal cutout at the bottom of the
 * physical panel. Styled after the MonoCab mockup: clock · occupancy ·
 * next stop | speed, in a compact monospace line.
 */
export default function TelemetryStrip({
  telemetry,
  lang,
}: {
  telemetry: MonoCabTelemetry | null;
  lang: Locale;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  const clock = now.toLocaleTimeString(lang === "de" ? "de-DE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const next = telemetry?.nextStops[0];

  return (
    <div
      aria-label={lang === "de" ? "Fahrzeugdaten" : "Vehicle data"}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "0 4%",
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontWeight: 700,
        fontSize: "clamp(11px, 2.1vw, 18px)",
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      <span style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
        <span>◷ {clock}</span>
        {telemetry && <span>⚇ {telemetry.occupancy}</span>}
        {next && (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", opacity: 0.85 }}>
            → {next.name[lang]} · {next.etaMinutes} min
          </span>
        )}
      </span>
      <span style={{ flexShrink: 0 }}>
        {telemetry ? `⊙ ${Math.round(telemetry.speedKmh)} KM/H` : "— KM/H"}
      </span>
    </div>
  );
}
