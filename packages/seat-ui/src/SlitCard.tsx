import { useEffect, useRef, useState } from "react";
import { Check, X, Minus, Plus, SkipForward, CircleCheck, RotateCcw, Mic } from "lucide-react";
import type { Locale, SeatCard, SeatCardIcon } from "@cosimo/shared";
import { schemeById, type ColorScheme } from "@cosimo/face";

/**
 * The slit as CoSiMo's control strip. One fixed grid for every card kind:
 * CONTEXT on the left (the spoken question, or the wizard step), ACTIONS on
 * the right — chips, swatches, a slider or −/+. Monochrome in the scheme's
 * ink, no fills: the chips read like keys printed into the slit. Every tap
 * target is ≥ 44 px; every icon-only chip carries its label as aria-label.
 */

const ICONS: Record<SeatCardIcon, typeof Check> = {
  check: Check, x: X, minus: Minus, plus: Plus, skip: SkipForward, done: CircleCheck,
};

/**
 * Sizes are in cqh of the SLIT (the cutout is its own size container):
 * on the iPad the slit is ~154 pt tall, so a chip is ~70 pt and the
 * question ~35 pt — readable from a seat, not phone-UI small. The clamps
 * keep the browser emulator (a much smaller stage) usable.
 */
const TAP = "clamp(40px, 46cqh, 96px)";
const CHIP_FONT = (textScale: number) => `clamp(12px, ${21 * textScale}cqh, ${44 * textScale}px)`;
const TEXT_FONT = (textScale: number) => `clamp(11px, ${24 * textScale}cqh, ${56 * textScale}px)`;

function Chip({
  label, icon, ink, onTap, textScale, ariaLabel,
}: { label: string; icon?: SeatCardIcon; ink: string; onTap: () => void; textScale: number; ariaLabel?: string }) {
  const [pressed, setPressed] = useState(false);
  const Icon = icon ? ICONS[icon] : null;
  return (
    <button
      onClick={() => { setPressed(true); setTimeout(onTap, 90); }}
      aria-label={ariaLabel ?? label}
      style={{
        appearance: "none",
        minWidth: TAP,
        height: TAP,
        padding: Icon ? 0 : "0 0.9em",
        border: `max(1.5px, 2cqh) solid ${ink}`,
        borderRadius: 999,
        background: pressed ? ink : "transparent",
        color: pressed ? "var(--slit-bg, #fff)" : ink,
        fontFamily: "inherit",
        fontWeight: 600,
        fontSize: CHIP_FONT(textScale),
        cursor: "pointer",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 90ms, color 90ms, transform 90ms",
        transform: pressed ? "scale(0.94)" : "none",
        touchAction: "manipulation",
      }}
    >
      {Icon ? <Icon size="1.15em" strokeWidth={2.2} aria-hidden /> : label}
    </button>
  );
}

function Slider({ card, ink, onCommit }: { card: SeatCard; ink: string; onCommit: (v: number) => void }) {
  const sc = card.scale!;
  const [v, setV] = useState(sc.value);
  const pct = ((v - sc.min) / (sc.max - sc.min)) * 100;
  return (
    <input
      type="range"
      min={sc.min}
      max={sc.max}
      step={sc.step}
      value={v}
      aria-label={card.question}
      onChange={(e) => setV(Number(e.target.value))}
      onPointerUp={() => onCommit(v)}
      onKeyUp={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") onCommit(v); }}
      style={{
        // a bare line with a knob — styled through accent-color + a track gradient
        width: "clamp(140px, 240cqh, 640px)",
        height: TAP,
        accentColor: ink,
        background: `linear-gradient(to right, ${ink} ${pct}%, transparent ${pct}%) no-repeat center / 100% 2px`,
        appearance: "auto",
        touchAction: "none",
        cursor: "pointer",
      }}
    />
  );
}

export function SlitCard({
  card, scheme, textScale, onLocal, onModel,
}: {
  card: SeatCard;
  scheme: ColorScheme;
  textScale: number;
  /** Local card: value goes to the hub. */
  onLocal: (value: string) => void;
  /** Model card: the label becomes the rider's next message. */
  onModel: (label: string) => void;
}) {
  const ink = scheme.ink;
  const pick = (value: string, label: string) => (card.local ? onLocal(value) : onModel(label));
  const extras = card.options.filter((o) => o.value.startsWith("__"));
  const main = card.options.filter((o) => !o.value.startsWith("__"));

  return (
    <div
      role="group"
      aria-label={card.question}
      style={{
        width: "100%", height: "100%", boxSizing: "border-box",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: "5cqh",
        padding: "6cqh var(--slit-inset, 5cqh)",
        overflow: "hidden", color: ink,
        // @ts-expect-error custom property for the pressed chip's text colour
        "--slit-bg": scheme.bg,
        animation: "slit-in 150ms ease-out",
      }}
    >
      <style>{`@keyframes slit-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }`}</style>
      {/* row 1: the spoken question (+ wizard step) */}
      <span style={{ display: "flex", alignItems: "baseline", gap: "0.6em", minWidth: 0, flexShrink: 0, lineHeight: 1.1 }}>
        {card.step && (
          <span style={{ fontSize: `clamp(10px, ${16 * textScale}cqh, 36px)`, fontWeight: 700, opacity: 0.6, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            {card.step.index + 1}/{card.step.total}
          </span>
        )}
        <span style={{
          fontSize: TEXT_FONT(textScale), fontWeight: 600,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
        }}>
          {card.question}
        </span>
      </span>

      {/* row 2: the chips — a horizontal strip that scrolls instead of clipping,
          with a soft fade on the right as the "there is more" cue */}
      <span style={{
        display: "flex", gap: "3.5cqh", alignItems: "center", flexShrink: 0,
        overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none",
        paddingRight: "10cqh",
        maskImage: "linear-gradient(to right, black calc(100% - 10cqh), transparent)",
        WebkitMaskImage: "linear-gradient(to right, black calc(100% - 10cqh), transparent)",
      }}>
        {card.kind === "themes" &&
          main.map((o) => {
            const sch = schemeById(o.value);
            return (
              <button
                key={o.value}
                onClick={() => pick(o.value, sch.label)}
                aria-label={sch.label}
                title={sch.label}
                style={{
                  appearance: "none", width: "clamp(30px, 42cqh, 88px)", height: "clamp(30px, 42cqh, 88px)",
                  borderRadius: "50%", border: `max(2px, 2cqh) solid ${sch.ink}`, background: sch.bg,
                  outline: scheme.id === sch.id ? `2px solid ${ink}` : "none", outlineOffset: 2,
                  cursor: "pointer", padding: 0, flexShrink: 0, touchAction: "manipulation",
                }}
              />
            );
          })}
        {card.kind === "scale" && card.scale?.control === "slider" && (
          <Slider card={card} ink={ink} onCommit={(v) => onLocal(String(v))} />
        )}
        {card.kind === "scale" && card.scale?.control === "stepper" && (
          <>
            <Chip label="kleiner" icon="minus" ink={ink} textScale={textScale} onTap={() => onLocal(String(Math.max(card.scale!.min, card.scale!.value - 1)))} />
            <Chip label="größer" icon="plus" ink={ink} textScale={textScale} onTap={() => onLocal(String(Math.min(card.scale!.max, card.scale!.value + 1)))} />
          </>
        )}
        {(card.kind === "confirm" || card.kind === "list" || card.kind === "voices") &&
          main.map((o) => (
            <Chip key={o.value} label={o.label} icon={o.icon} ink={ink} textScale={textScale} onTap={() => pick(o.value, o.label)} />
          ))}
        {extras.map((o) => (
          <Chip key={o.value} label={o.label} icon={o.icon} ink={ink} textScale={textScale} onTap={() => onLocal(o.value)} />
        ))}
      </span>
    </div>
  );
}

/** ↻ — visible for a few seconds after every reply; says it again. */
export function RepeatAffordance({ lastReplyAt, ink, onRepeat, lang }: { lastReplyAt: number; ink: string; onRepeat: () => void; lang: Locale }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!lastReplyAt) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 8000);
    return () => clearTimeout(t);
  }, [lastReplyAt]);
  if (!show) return null;
  return (
    <button
      onClick={() => { onRepeat(); setShow(false); }}
      aria-label={lang === "de" ? "Nochmal sagen" : "Say it again"}
      title={lang === "de" ? "Nochmal sagen" : "Say it again"}
      style={{
        appearance: "none", width: TAP, height: TAP, borderRadius: "50%",
        border: `max(1.5px, 2cqh) solid ${ink}`, background: "transparent", color: ink,
        fontSize: CHIP_FONT(1),
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", flexShrink: 0, opacity: 0.85, touchAction: "manipulation",
      }}
    >
      <RotateCcw size="1.2em" aria-hidden />
    </button>
  );
}

/** Idle hint: after 30 s without any rider activity, once, minimal. */
export function IdleHint({ lastActivityAt, ink, textScale, lang }: { lastActivityAt: number; ink: string; textScale: number; lang: Locale }) {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setIdle(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), 30_000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [lastActivityAt]);
  if (!idle) return null;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5em", color: ink, opacity: 0.8, fontSize: TEXT_FONT(textScale) }}>
      <Mic size="1em" aria-hidden />
      <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
        {lang === "de" ? "Taste halten und sprechen" : "Hold the button and speak"}
      </span>
    </div>
  );
}
