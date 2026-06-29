"use client";

import type { Locale, MonoCabTelemetry } from "@cosimo/shared";

/**
 * Always-on MonoCab telemetry strip. The realtime service broadcasts a snapshot
 * on a short interval (mocked data — no real MonoCab integration). Gives the
 * conversation a concrete context the rider can see.
 */
export default function TelemetryStrip({
  telemetry,
  lang,
}: {
  telemetry: MonoCabTelemetry | null;
  lang: Locale;
}) {
  if (!telemetry) return null;
  const next = telemetry.nextStops[0];
  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const items: { label: string; value: string }[] = [
    { label: t("Tempo", "Speed"), value: `${Math.round(telemetry.speedKmh)} km/h` },
    next
      ? { label: t("Nächster Halt", "Next stop"), value: `${next.name[lang]} · ${next.etaMinutes} min` }
      : { label: t("Ziel", "Destination"), value: telemetry.destination[lang] },
    { label: t("Auslastung", "Occupancy"), value: `${telemetry.occupancy}/${telemetry.capacity}` },
    { label: t("Akku", "Battery"), value: `${Math.round(telemetry.batteryPct)} %` },
  ];

  return (
    <div
      aria-label={t("Fahrzeugdaten", "Vehicle data")}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        justifyContent: "center",
        fontSize: 14,
        opacity: 0.8,
      }}
    >
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.6 }}>
            {it.label}
          </span>
          <span style={{ fontWeight: 600 }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}
