import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X, RotateCcw, Mic } from "lucide-react";
import type { Locale, SeatCard, SeatCardIcon } from "@cosimo/shared";
import type { ColorScheme } from "@cosimo/face";

/**
 * The slit as CoSiMo's control strip. One fixed grid: CONTEXT on the left
 * (the spoken question), ACTIONS on the right — chips. Monochrome in the
 * scheme's ink, no fills: the chips read like keys printed into the slit.
 * Every tap target is ≥ 44 px; every icon-only chip carries its label as
 * aria-label. The same vocabulary (Chip, sizes) builds the settings menu.
 */

const ICONS: Record<SeatCardIcon, typeof Check> = { check: Check, x: X };

/**
 * Sizes are in cqh of the SLIT (the cutout is its own size container):
 * on the iPad the slit is ~154 pt tall, so a chip is ~70 pt and the
 * question ~35 pt — readable from a seat, not phone-UI small. The clamps
 * keep the browser emulator (a much smaller stage) usable.
 */
export const TAP = "clamp(40px, 46cqh, 96px)";
export const CHIP_FONT = (textScale: number) => `clamp(12px, ${21 * textScale}cqh, ${44 * textScale}px)`;
export const TEXT_FONT = (textScale: number) => `clamp(11px, ${24 * textScale}cqh, ${56 * textScale}px)`;

export function Chip({
  label, icon, ink, onTap, textScale, ariaLabel, active = false, children,
}: {
  label: string;
  icon?: SeatCardIcon;
  ink: string;
  onTap: () => void;
  textScale: number;
  ariaLabel?: string;
  /** The current value: drawn filled. */
  active?: boolean;
  /** Custom content (an icon element) instead of the label. */
  children?: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const Icon = icon ? ICONS[icon] : null;
  const iconOnly = Boolean(Icon || children);
  const filled = pressed || active;
  return (
    <button
      onClick={() => { setPressed(true); setTimeout(() => { setPressed(false); onTap(); }, 90); }}
      aria-label={ariaLabel ?? label}
      aria-pressed={active || undefined}
      title={iconOnly ? (ariaLabel ?? label) : undefined}
      style={{
        appearance: "none",
        minWidth: TAP,
        height: TAP,
        padding: iconOnly ? 0 : "0 0.9em",
        border: `max(1.5px, 2cqh) solid ${ink}`,
        borderRadius: 999,
        background: filled ? ink : "transparent",
        color: filled ? "var(--slit-bg, #fff)" : ink,
        fontFamily: "inherit",
        fontWeight: 600,
        fontSize: CHIP_FONT(textScale),
        cursor: "pointer",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "background 90ms, color 90ms, transform 90ms",
        transform: pressed ? "scale(0.94)" : "none",
        touchAction: "manipulation",
      }}
    >
      {Icon ? <Icon size="1.15em" strokeWidth={2.2} aria-hidden /> : children ?? label}
    </button>
  );
}

/** The strip's shell: question left, a scrolling row of actions beneath. */
export function SlitGrid({ label, scheme, textScale, children, aside }: { label: string; scheme: ColorScheme; textScale: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        width: "100%", height: "100%", boxSizing: "border-box",
        display: "flex", alignItems: "center", gap: "4cqh",
        padding: "6cqh var(--slit-inset, 5cqh)",
        overflow: "hidden", color: scheme.ink,
        // @ts-expect-error custom property for the pressed chip's text colour
        "--slit-bg": scheme.bg,
        animation: "slit-in 150ms ease-out",
      }}
    >
      <style>{`@keyframes slit-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }`}</style>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "5cqh" }}>
        {/* row 1: the context line */}
        <span style={{
          fontSize: TEXT_FONT(textScale), fontWeight: 600, lineHeight: 1.1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
        }}>
          {label}
        </span>
        {/* row 2: the actions — a horizontal strip that scrolls instead of clipping,
            with a soft fade on the right as the "there is more" cue */}
        <span style={{
          display: "flex", gap: "3.5cqh", alignItems: "center", flexShrink: 0,
          overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none",
          paddingRight: "10cqh",
          maskImage: "linear-gradient(to right, black calc(100% - 10cqh), transparent)",
          WebkitMaskImage: "linear-gradient(to right, black calc(100% - 10cqh), transparent)",
        }}>
          {children}
        </span>
      </div>
      {aside}
    </div>
  );
}

/** A yes/no question from the model: a tap sends the label as the rider's next message. */
export function SlitCard({ card, scheme, textScale, onPick }: { card: SeatCard; scheme: ColorScheme; textScale: number; onPick: (label: string) => void }) {
  return (
    <SlitGrid label={card.question} scheme={scheme} textScale={textScale}>
      {card.options.map((o) => (
        <Chip key={o.value} label={o.label} icon={o.icon} ink={scheme.ink} textScale={textScale} onTap={() => onPick(o.label)} />
      ))}
    </SlitGrid>
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
