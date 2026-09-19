import { useEffect, useRef } from "react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";

/**
 * Subtitle: the sentence CoSiMo is speaking right now (clips arrive per
 * sentence, so this is in step with the voice), large, one line; beneath
 * it the next stop stays as the quiet small line. After the reply the last
 * sentence stands for a while with the ↻ affordance beside it.
 *
 * A sentence longer than the slit is not clamped — it RUNS: it starts at
 * its beginning, holds a beat, then slides right-to-left until its end is
 * in view, at roughly the pace of the voice, and holds there. Reduced
 * motion: two clamped lines instead.
 */
const HOLD_MS = 700;
/** Scroll speed in font-size units per second (≈ the pace of speech). */
const SPEED_EM_PER_S = 5.5;

export default function SlitCaption({
  text,
  telemetry,
  lang,
  textScale,
  aside,
  reduceMotion = false,
}: {
  text: string;
  telemetry: MonoCabTelemetry | null;
  lang: Locale;
  textScale: number;
  /** Rendered at the right edge (the ↻ affordance after a reply). */
  aside?: React.ReactNode;
  reduceMotion?: boolean;
}) {
  const next = telemetry?.nextStops[0];
  const small = next ? `${lang === "de" ? "nächster Halt" : "next stop"} · ${next.name[lang]} · ${next.etaMinutes} min` : "";
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    const line = lineRef.current;
    if (!box || !line || reduceMotion) return;
    let anim: Animation | null = null;
    const run = () => {
      anim?.cancel();
      anim = null;
      line.style.transform = "none";
      const overflow = line.scrollWidth - box.clientWidth;
      if (overflow <= 2 || typeof line.animate !== "function") return;
      const em = parseFloat(getComputedStyle(line).fontSize) || 16;
      const scrollMs = Math.max(800, (overflow / (em * SPEED_EM_PER_S)) * 1000);
      const total = HOLD_MS + scrollMs + HOLD_MS;
      anim = line.animate(
        [
          { transform: "translateX(0)", offset: 0 },
          { transform: "translateX(0)", offset: HOLD_MS / total },
          { transform: `translateX(${-overflow}px)`, offset: (HOLD_MS + scrollMs) / total },
          { transform: `translateX(${-overflow}px)`, offset: 1 },
        ],
        { duration: total, easing: "linear", fill: "forwards" },
      );
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(box);
    return () => { ro.disconnect(); anim?.cancel(); };
  }, [text, reduceMotion, textScale]);
  return (
    <div
      aria-live="polite"
      style={{
        width: "100%", height: "100%", boxSizing: "border-box",
        display: "flex", alignItems: "center", gap: "4cqh",
        padding: "5cqh var(--slit-inset, 7cqh)",
        overflow: "hidden",
        animation: "slit-in 220ms ease-out",
      }}
    >
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3cqh" }}>
        {reduceMotion ? (
          <span
            style={{
              fontSize: `clamp(13px, ${24 * textScale}cqh, ${56 * textScale}px)`, fontWeight: 600, lineHeight: 1.12,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {text}
          </span>
        ) : (
          <div ref={boxRef} style={{ overflow: "hidden", minWidth: 0 }}>
            <span
              ref={lineRef}
              style={{
                display: "inline-block", whiteSpace: "nowrap", willChange: "transform",
                fontSize: `clamp(13px, ${24 * textScale}cqh, ${56 * textScale}px)`, fontWeight: 600, lineHeight: 1.12,
              }}
            >
              {text}
            </span>
          </div>
        )}
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
