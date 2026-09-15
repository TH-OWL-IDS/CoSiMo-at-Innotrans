import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";

/**
 * The slit at rest: a small rotation of displays, each sliding in vertically
 * (alternately from below and from above) every few seconds —
 *   status      "Barntrup in 3 min"            (next stop + ETA; at a halt: departs in m:ss)
 *   line        "Begatalbahn"
 *   approaching "Nächste Station · Farmbeck"   (only on the last stretch of a leg)
 *   mic         (icon) "Taste halten & sprechen"
 * A fault or delay adds its own slide. Every display is two lines: the
 * statement large, its context small. Reduced motion: a plain swap.
 */
interface Slide {
  key: string;
  big: string;
  small: string;
  icon?: "mic";
}

/** Operator-tunable timing of the rotation (kiosk settings). */
export interface SlitMotion {
  /** Seconds each display stays. */
  stepSec: number;
  /** Milliseconds one vertical slide takes. */
  slideMs: number;
}
export const DEFAULT_SLIT_MOTION: SlitMotion = { stepSec: 8, slideMs: 620 };

function slidesFor(t: MonoCabTelemetry | null, lang: Locale): Slide[] {
  const de = lang === "de";
  const out: Slide[] = [];
  const next = t?.nextStops[0];
  const fault = t?.faults?.[0];
  const delay = t?.delayMinutes ?? 0;
  const atHalt = t?.position.phase !== "drive" && t?.position.departsInSec != null;
  const here = t ? t.stops[t.position.stopIndex] : undefined;

  if (t && next) {
    if (atHalt && here) {
      const s = Math.max(0, t.position.departsInSec ?? 0);
      out.push({ key: "status", big: here.name[lang], small: `${de ? "Abfahrt in" : "Departing in"} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` });
    } else {
      const eta = next.etaMinutes;
      out.push({
        key: "status",
        big: `${next.name[lang]} ${de ? "in" : "in"} ${eta === 0 ? (de ? "unter 1 min" : "under 1 min") : `${eta} min`}`,
        small: `${de ? "Richtung" : "Towards"} ${t.destination[lang]}${delay ? ` · +${delay} min` : ""}`,
      });
    }
  }
  if (t?.line?.[lang]) out.push({ key: "line", big: t.line[lang], small: de ? "Linie" : "Line" });
  if (t && next && !atHalt && (next.etaMinutes <= 1 || t.position.progress >= 0.75)) {
    out.push({ key: "approaching", big: next.name[lang], small: de ? "Nächste Station" : "Next station" });
  }
  if (fault) out.push({ key: "fault", big: fault.cause[lang], small: de ? "Störung" : "Fault" });
  out.push({ key: "mic", icon: "mic", big: de ? "Taste halten & sprechen" : "Hold the button & speak", small: de ? "Sprich mit CoSiMo" : "Talk to CoSiMo" });
  return out;
}

function SlideView({ s, big, textScale }: { s: Slide; big: number; textScale: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, boxSizing: "border-box", display: "flex", alignItems: "center", gap: "5cqh", padding: "6cqh var(--slit-inset, 7cqh)", whiteSpace: "nowrap", overflow: "hidden" }}>
      {s.icon === "mic" && <Mic size={`${(34 * textScale).toFixed(1)}cqh`} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0 }} />}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "3cqh" }}>
        {/* no overflow clipping on the lines themselves: line-height 1 + overflow:hidden
            cut the descenders (g, p); the font is shrunk to fit instead, and the slit clips */}
        <span style={{ fontSize: `clamp(14px, ${(big * textScale).toFixed(1)}cqh, 72px)`, fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em" }}>{s.big}</span>
        <span style={{ fontSize: `clamp(11px, ${(17 * textScale).toFixed(1)}cqh, 36px)`, fontWeight: 500, lineHeight: 1.2, opacity: 0.62 }}>{s.small}</span>
      </div>
    </div>
  );
}

export default function TelemetryStrip({
  telemetry,
  lang,
  reduceMotion = false,
  motion = DEFAULT_SLIT_MOTION,
  textScale = 1,
}: {
  telemetry: MonoCabTelemetry | null;
  lang: Locale;
  reduceMotion?: boolean;
  motion?: SlitMotion;
  /** The rider's text size (1 = the slit's full size, smaller only). */
  textScale?: number;
}) {
  const CYCLE_MS = Math.max(1000, motion.stepSec * 1000);
  const SLIDE_MS = Math.max(0, Math.min(2000, motion.slideMs));
  const slides = slidesFor(telemetry, lang);
  const [index, setIndex] = useState(0);
  /** The slide leaving and which way the pair moves: +1 = new one comes from below. */
  const [leaving, setLeaving] = useState<{ slide: Slide; dir: 1 | -1 } | null>(null);
  const dirRef = useRef<1 | -1>(1);
  const cur = slides[index % slides.length] ?? slides[0]!;
  const curKey = cur.key;
  const shownRef = useRef(cur);
  shownRef.current = cur;

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      dirRef.current = dirRef.current === 1 ? -1 : 1;
      setLeaving({ slide: shownRef.current, dir: dirRef.current });
      setIndex((i) => i + 1);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [slides.length, CYCLE_MS]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), SLIDE_MS);
    return () => clearTimeout(t);
  }, [leaving, SLIDE_MS]);

  // long statements ("Barntrup Hauptstation in 12 min") shrink to the room between the rounded ends
  const bigSize = (s: Slide) => Math.min(34, 380 / (Math.max(1, s.big.length + (s.icon ? 4 : 0)) * 0.6));
  const dir = leaving?.dir ?? dirRef.current;
  const anim = (name: string) => (reduceMotion ? "none" : `${name} ${SLIDE_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1) both`);

  return (
    <div aria-label={lang === "de" ? "Fahrtinformation" : "Journey information"} aria-live="polite" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <style>{`
@keyframes slit-in-up   { from { transform: translateY(100%);  opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes slit-in-down { from { transform: translateY(-100%); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes slit-out-up   { from { transform: none; opacity: 1 } to { transform: translateY(-100%); opacity: 0 } }
@keyframes slit-out-down { from { transform: none; opacity: 1 } to { transform: translateY(100%);  opacity: 0 } }`}</style>
      {leaving && (
        <div key={`out-${leaving.slide.key}-${index}`} style={{ position: "absolute", inset: 0, animation: anim(dir === 1 ? "slit-out-up" : "slit-out-down") }}>
          <SlideView s={leaving.slide} big={bigSize(leaving.slide)} textScale={textScale} />
        </div>
      )}
      <div key={`in-${curKey}-${index}`} style={{ position: "absolute", inset: 0, animation: leaving ? anim(dir === 1 ? "slit-in-up" : "slit-in-down") : "none" }}>
        <SlideView s={cur} big={bigSize(cur)} textScale={textScale} />
      </div>
    </div>
  );
}
