import { useEffect, useRef, type ReactNode } from "react";
import type { Locale, PipelinePhase } from "@cosimo/shared";
import { CosimoFaceAnimated } from "@cosimo/face";
import { IdleHint, RepeatAffordance, SlitCard } from "./SlitCard.js";
import TelemetryStrip from "./TelemetryStrip.js";
import ConsentOverlay from "./ConsentOverlay.js";
import { IPAD_MINI_ASPECT, type PanelLayout } from "./panelLayout.js";
import type { Seat } from "./useSeat.js";

/**
 * Running conversation, shown inside the circle for text-first (deaf) riders:
 * a small face sits above, this fills the rest and auto-scrolls to the latest.
 * No replay button — re-requests stay conversational ("say that again").
 */
function Transcript({
  items,
  reply,
  replying,
  ink,
  textScale,
  bold,
}: {
  items: { role: "user" | "cosimo"; text: string }[];
  reply: string;
  replying: boolean;
  ink: string;
  textScale: number;
  bold: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, reply]);

  return (
    <div
      ref={boxRef}
      role="log"
      aria-live="polite"
      style={{
        position: "absolute",
        left: "50%",
        top: "36%",
        transform: "translateX(-50%)",
        width: "78%",
        height: "56%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: `${6 * textScale}px`,
        fontSize: `${13 * textScale}px`,
        lineHeight: 1.35,
        fontWeight: bold ? 700 : 400,
        color: ink,
        scrollbarWidth: "none",
      }}
    >
      {/* no idle hint — talking happens via the physical button */}
      {items.map((m, i) => (
        <div
          key={i}
          style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            textAlign: m.role === "user" ? "right" : "left",
            maxWidth: "88%",
            opacity: m.role === "user" ? 0.6 : 1,
          }}
        >
          {m.text}
        </div>
      ))}
      {replying && reply && (
        <div style={{ alignSelf: "flex-start", maxWidth: "88%" }}>{reply} ▍</div>
      )}
    </div>
  );
}

// No idle hint — talking happens via the physical button, not the screen.
const PHASE_HINT: Record<PipelinePhase, Record<Locale, string>> = {
  idle: { de: "", en: "" },
  listening: { de: "Hört zu …", en: "Listening …" },
  thinking: { de: "Denkt nach …", en: "Thinking …" },
  speaking: { de: "", en: "" },
};

/**
 * The seat as the rider sees it: a black stage with two cutouts — a circle
 * (CoSiMo's face) and a slit (telemetry) — exactly as the physical panel
 * reveals them. Rendered identically by the native iPad app and the browser
 * emulator; only *what drives it* differs (HID keys vs on-screen buttons),
 * and that lives outside this component.
 *
 * The circle is display-only: touch does nothing here by design. The one
 * gesture is the operator's — a 3s hold on the slit (`onSlitHold`).
 */
export default function SeatView({
  seat,
  layout,
  fullscreen,
  surface = "cabin",
  onSlitHold,
  children,
}: {
  seat: Seat;
  layout: PanelLayout;
  /**
   * True on the iPad: the stage is the whole screen. False in a browser:
   * a centred portrait frame in the iPad mini's aspect ratio, so the
   * calibrated layout never overlaps in a landscape window.
   */
  fullscreen: boolean;
  /**
   * What surrounds the cutouts. "cabin" (the iPad): pitch black, so light
   * bleed around the physical panel is invisible. "panel" (the emulator): an
   * off-white ground with the circle and slit inset — a soft inner shadow and
   * a faint halo, the way holes in a real panel read.
   */
  surface?: "cabin" | "panel";
  /** Operator gesture: the slit was held for 3 seconds. */
  onSlitHold?: () => void;
  /** Overlays drawn on top of the stage (e.g. the hidden test console). */
  children?: ReactNode;
}) {
  const { cosimo, lang, scheme, textScale, highContrast, showText, reduceMotion, ptt } = seat;

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = () => {
    if (onSlitHold) holdTimer.current = setTimeout(onSlitHold, 3000);
  };
  const holdEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  // All panel geometry is measured against the STAGE (a CSS size container),
  // not the viewport — on the iPad the two coincide.
  const circleSize = `min(${layout.circleD}cqw, 96cqh)`;
  const guide = layout.guides ? "2px dashed rgba(255,80,80,0.9)" : "none";
  const panel = surface === "panel";
  /** The inset look: an inner shadow drawn above the content (so nothing
   *  covers its edge) plus a soft halo on the ground around the hole. */
  const insetShadow = "inset 0 2px 6px rgba(0,0,0,0.14), inset 0 0 0 0.5px rgba(0,0,0,0.05)";
  const halo = "0 0.5px 1.5px rgba(0,0,0,0.05), 0 0 10px rgba(0,0,0,0.035)";
  const Inset = ({ radius }: { radius: string | number }) =>
    panel ? <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: insetShadow, pointerEvents: "none", zIndex: 5 }} /> : null;

  /**
   * The circle's edge glow — on the "screen", i.e. beneath the panel's inset
   * shadow (z 4 < 5): a soft green rim while the microphone is live; while
   * CoSiMo thinks the green fades into a faint greyish arc orbiting the
   * edge. Plain elements (not inline components), so React keeps them
   * mounted and the opacity transitions actually run. The arc stands
   * still with reduced motion.
   */
  const listening = ptt.active || cosimo.phase === "listening";
  const thinking = !listening && cosimo.phase === "thinking";
  const glowRim = (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none", zIndex: 4,
        boxShadow: "inset 0 0 calc(var(--circle) * 0.05) 0 rgba(72, 199, 108, 0.5)",
        opacity: listening ? 1 : 0,
        transition: "opacity 500ms ease",
      }}
    />
  );
  const glowArc = (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none", zIndex: 4,
        // a thin band at the edge: a conic arc, masked to the outer 3.5 %, softened
        background: "conic-gradient(from 0deg, transparent 0deg, rgba(150, 168, 156, 0) 60deg, rgba(150, 168, 156, 0.45) 130deg, transparent 200deg)",
        WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3.5%), #000 calc(100% - 3%))",
        mask: "radial-gradient(farthest-side, transparent calc(100% - 3.5%), #000 calc(100% - 3%))",
        filter: "blur(calc(var(--circle) * 0.012))",
        opacity: thinking ? 1 : 0,
        transition: "opacity 600ms ease",
        animation: reduceMotion ? "none" : "cosimo-orbit 2.4s linear infinite",
        animationPlayState: thinking ? "running" : "paused",
      }}
    />
  );

  return (
    <main
      style={{
        // The iPad: the stage is the screen. A browser frame: fill the box the
        // host page gives us — never the viewport, or we'd paint over its UI.
        position: fullscreen ? "fixed" : "absolute",
        inset: 0,
        // Behind the panel: pitch black, so light bleed around cutouts is
        // invisible. The emulator shows the panel itself: off-white.
        background: panel ? "#f4f3f0" : "#000",
        color: scheme.ink,
        overflow: "hidden",
        // Kiosk surface: long-pressing must never select text or pop the
        // OS copy/look-up callout (iPad long-press, desktop drag-select).
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        // Center the stage when it doesn't fill the window (browser).
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ["--bg" as string]: scheme.bg,
        ["--ink" as string]: scheme.ink,
      }}
    >
      {/* ── the stage: the iPad's screen ────────────────────────── */}
      <div
        style={{
          position: "relative",
          containerType: "size",
          ...(fullscreen
            ? { width: "100%", height: "100%" }
            : {
                width: `min(100%, calc(100vh * (${IPAD_MINI_ASPECT})))`,
                aspectRatio: IPAD_MINI_ASPECT,
                maxHeight: "100%",
                // The iPad's edge — only when the ground is black. On the
                // panel surface the stage is invisible: same off-white.
                outline: panel ? "none" : "1px solid rgba(255,255,255,0.12)",
              }),
        }}
      >
        {/* ── circle cutout: the Face ─────────────────────────────── */}
        <div
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            left: `${layout.circleX}%`,
            top: `${layout.circleY}%`,
            transform: "translate(-50%, -50%)",
            width: circleSize,
            height: circleSize,
            borderRadius: "50%",
            background: scheme.bg,
            overflow: "hidden",
            outline: guide,
            boxShadow: panel ? halo : undefined,
            touchAction: "none",
            transition: "background 300ms",
            ["--circle" as string]: circleSize,
          }}
        >
          <style>{`@keyframes cosimo-orbit { to { transform: rotate(360deg) } }`}</style>
          {glowRim}
          {glowArc}
          <Inset radius="50%" />
          {/* the Face — centred by default; shrinks to the top when the rider
              reads a running transcript (showText). reduceMotion stills its idle life. */}
          <div
            style={{
              position: "absolute",
              // 52%: the artwork's visual mass (eyes mid 125, mouth 104) sits
              // left of its viewBox centre (130) — this optically centres it.
              left: "52%",
              top: showText ? "18%" : "48%",
              transform: "translate(-50%, -50%)",
              width: showText ? "44%" : "88%",
              transition: "top 300ms, width 300ms",
            }}
          >
            <CosimoFaceAnimated
              emotion={cosimo.faceEmotion}
              idle={!reduceMotion}
              mouthDrive={cosimo.getMouthDrive}
              style={{ width: "100%", height: "auto", color: scheme.ink, display: "block" }}
            />
          </div>

          {/* Reply text is progressive disclosure: face-and-voice-first by
              default (only a short phase hint); a running transcript when the
              rider needs to read (showText, e.g. a deaf rider). */}
          {showText ? (
            <Transcript
              items={cosimo.transcript}
              reply={cosimo.reply}
              replying={cosimo.replying}
              ink={scheme.ink}
              textScale={textScale}
              bold={highContrast}
            />
          ) : (
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              style={{
                position: "absolute",
                left: "50%",
                bottom: "9%",
                transform: "translateX(-50%)",
                width: "62%",
                textAlign: "center",
                fontSize: `clamp(12px, ${2.8 * textScale}cqw, ${18 * textScale}px)`,
                lineHeight: 1.35,
                fontWeight: highContrast ? 700 : 400,
                opacity: 0.55,
              }}
            >
              {seat.consentDecided ? PHASE_HINT[cosimo.phase][lang] : ""}
            </div>
          )}

          {/* listening ring while push-to-talk is held */}
          {ptt.active && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "6px solid currentColor",
                opacity: 0.35,
                pointerEvents: "none",
              }}
            />
          )}

          {/* connection state, tucked at the top of the circle */}
          {!cosimo.connected && (
            <div
              role="status"
              style={{
                position: "absolute",
                top: "7%",
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: "clamp(10px, 2.2cqw, 14px)",
                opacity: 0.5,
              }}
            >
              {lang === "de" ? "Verbindung wird hergestellt …" : "Connecting …"}
            </div>
          )}

          {!seat.consentDecided && (
            <ConsentOverlay lang={lang} onDecide={seat.decideConsent} onToggleLang={seat.toggleLang} />
          )}
        </div>

        {/* ── slit cutout: telemetry ──────────────────────────────── */}
        <div
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onPointerCancel={holdEnd}
          style={{
            position: "absolute",
            left: `${layout.slitX}%`,
            top: `${layout.slitY}%`,
            transform: "translate(-50%, -50%)",
            width: `${layout.slitW}%`,
            height: `${layout.slitH}%`,
            borderRadius: layout.slitR,
            background: scheme.bg,
            color: scheme.ink,
            overflow: "hidden",
            outline: guide,
            boxShadow: panel ? halo : undefined,
            transition: "background 300ms",
          }}
        >
          <Inset radius={layout.slitR} />
          {cosimo.card ? (
            <SlitCard
              card={cosimo.card}
              scheme={scheme}
              textScale={textScale}
              onLocal={(value) => cosimo.answerCard(cosimo.card!.id, value)}
              onModel={(label) => cosimo.send(label, lang, "tap")}
            />
          ) : (
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              {seat.consentDecided && !cosimo.replying && (
                <IdleHint lastActivityAt={cosimo.lastActivityAt} ink={scheme.ink} textScale={textScale} lang={lang} />
              )}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0, height: "100%" }}>
                  <TelemetryStrip telemetry={cosimo.telemetry} lang={lang} />
                </div>
                <div style={{ flexShrink: 0, paddingRight: "3%", display: "flex", alignItems: "center" }}>
                  <RepeatAffordance lastReplyAt={cosimo.lastReplyAt} ink={scheme.ink} onRepeat={cosimo.repeatLast} lang={lang} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {children}
    </main>
  );
}
