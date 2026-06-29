"use client";

import { CABIN_CONTROLS, type CabinControlState, type Locale } from "@cosimo/shared";

/**
 * Live read-only display of the cabin controls, synced across all iPads. The
 * rider changes these by *asking CoSiMo* (voice/text → agent → set_cabin_control);
 * this panel reflects the result. The real interior light shows a "live" badge;
 * a degraded badge appears if the hardware was unreachable.
 */
export default function CabinPanel({
  cabin,
  lang,
}: {
  cabin: CabinControlState[];
  lang: Locale;
}) {
  const byId = new Map(cabin.map((c) => [c.id, c]));

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        justifyContent: "center",
        maxWidth: "44rem",
      }}
    >
      {CABIN_CONTROLS.map((def) => {
        const state = byId.get(def.id);
        const active =
          def.kind === "toggle" ? Boolean(state?.on) : (state?.level ?? 0) > 0;
        const valueLabel =
          def.kind === "toggle"
            ? active
              ? lang === "de"
                ? "an"
                : "on"
              : lang === "de"
                ? "aus"
                : "off"
            : `${state?.level ?? 0}%`;

        return (
          <div
            key={def.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid currentColor",
              opacity: active ? 1 : 0.45,
              transition: "opacity 200ms",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: active ? "currentColor" : "transparent",
                border: "1px solid currentColor",
                boxShadow: active ? "0 0 8px currentColor" : "none",
              }}
            />
            <span style={{ fontSize: 14 }}>{def.label[lang]}</span>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{valueLabel}</span>
            {def.real && (
              <span style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.6, textTransform: "uppercase" }}>
                {state?.degraded ? (lang === "de" ? "offline" : "offline") : "live"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
