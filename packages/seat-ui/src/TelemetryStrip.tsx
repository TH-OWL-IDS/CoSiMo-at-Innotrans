import { useEffect, useState } from "react";
import { ArrowRight, Clock, Gauge, Users } from "lucide-react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";

/** Icons scale with the strip's font; `aria-hidden` — the numbers carry the meaning. */
const icon = { size: "1em", strokeWidth: 2.5, "aria-hidden": true, style: { flexShrink: 0 } } as const;
const Item = ({ children }: { children: React.ReactNode }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35em", minWidth: 0 }}>{children}</span>
);

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
        fontSize: "clamp(11px, 2.1cqw, 18px)",
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      <span style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
        <Item><Clock {...icon} /> {clock}</Item>
        {telemetry && <Item><Users {...icon} /> {telemetry.occupancy}</Item>}
        {next && (
          <Item>
            <ArrowRight {...icon} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", opacity: 0.85 }}>
              {next.name[lang]} · {next.etaMinutes} min
            </span>
          </Item>
        )}
      </span>
      <Item>
        <Gauge {...icon} /> {telemetry ? `${Math.round(telemetry.speedKmh)} KM/H` : "— KM/H"}
      </Item>
    </div>
  );
}
