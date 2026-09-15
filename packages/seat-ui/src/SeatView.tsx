import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Locale, PipelinePhase } from "@cosimo/shared";
import { CosimoFaceAnimated, withAlpha, type StateColors } from "@cosimo/face";
import { RepeatAffordance, SlitCard } from "./SlitCard.js";
import TelemetryStrip, { type SlitMotion } from "./TelemetryStrip.js";
import SlitWave from "./SlitWave.js";
import SlitCaption from "./SlitCaption.js";
import { useShowcase } from "./useShowcase.js";
import { IPAD_MINI_ASPECT, type PanelLayout } from "./panelLayout.js";
import type { Seat } from "./useSeat.js";


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
/** Once shown, the thinking dot stays at least this long. */
const THINK_MIN_MS = 760;

/** `on`, but never dropping before `minMs` after it last rose. */
function useMinPresence(on: boolean, minMs: number): boolean {
  const [shown, setShown] = useState(on);
  const since = useRef(0);
  useEffect(() => {
    if (on) {
      since.current = Date.now();
      setShown(true);
      return;
    }
    const wait = Math.max(0, minMs - (Date.now() - since.current));
    const t = setTimeout(() => setShown(false), wait);
    return () => clearTimeout(t);
  }, [on, minMs]);
  return shown;
}

export default function SeatView({
  seat,
  layout,
  fullscreen,
  surface = "cabin",
  onSlitHold,
  showcase = false,
  slitMotion,
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
   * What surrounds the cutouts. "cabin" (the iPad): black, so it vanishes
   * behind the panel (the calibrated cutouts are unaffected) — and while
   * CoSiMo thinks or speaks, soft blobs in the scheme's state colour drift
   * across it, so whatever shows around the panel's cutouts breathes with
   * the conversation. "panel" (the emulator): an
   * off-white ground with the circle and slit inset — a soft inner shadow and
   * a faint halo, the way holes in a real panel read.
   */
  surface?: "cabin" | "panel";
  /** Operator gesture: the slit was held for 3 seconds. */
  onSlitHold?: () => void;
  /** Showcase ("Schaustellung"): the seat performs silently, endlessly; the
   *  live conversation state is ignored until the operator turns it off. */
  showcase?: boolean;
  /** Timing of the slit's rest rotation (kiosk operator setting). */
  slitMotion?: SlitMotion;
  /** Overlays drawn on top of the stage (e.g. the hidden test console). */
  children?: ReactNode;
}) {
  const { cosimo, lang, textScale, reduceMotion, ptt } = seat;
  // Showcase overlays the live state: same renderer, different source.
  const show = useShowcase(Boolean(showcase), lang, seat.scheme);
  const scheme = show?.scheme ?? seat.scheme;
  const showText = show ? true : seat.showText;
  const faceEmotion = show ? show.emotion : cosimo.faceEmotion;
  const phase = show ? show.phase : cosimo.phase;
  const speaking = show ? show.phase === "speaking" : Boolean(cosimo.speaking);
  const mouthDrive = show ? show.mouthDrive : cosimo.getMouthDrive;

  // CoSiMo follows a finger on its face: while the circle is pressed (not on
  // a button or card), the pointer's position relative to the face becomes
  // the gaze target; releasing lets the eyes drift back into the idle life.
  const faceRef = useRef<HTMLDivElement>(null);
  const gazeRef = useRef<{ x: number; y: number } | null>(null);
  const gazeFrom = (e: React.PointerEvent) => {
    const r = faceRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const x = ((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 1.2;
    const y = ((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * 1.2;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  };
  const gazeStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a, [role=button]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    gazeRef.current = gazeFrom(e);
  };
  const gazeMove = (e: React.PointerEvent) => {
    if (gazeRef.current) gazeRef.current = gazeFrom(e);
  };
  const gazeEnd = () => {
    gazeRef.current = null;
  };
  const gazeDrive = () => gazeRef.current;

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
   * shadow (z 4 < 5), in the scheme's state colours: a soft rim while the
   * microphone is live (listening), a softer one while the voice plays
   * (speaking), the error colour when the mic failed; while CoSiMo thinks,
   * a single soft dot fades in, orbits the rim and fades out (kept at
   * least THINK_MIN_MS). Plain elements, so the fades actually run; the
   * dot stands still with reduced motion.
   */
  const listening = ptt.active || phase === "listening";
  // The wave stays mounted ~260 ms after release so it can settle and fade
  // instead of vanishing on the frame the button comes up.
  const [waveShown, setWaveShown] = useState(false);
  useEffect(() => {
    if (ptt.active) { setWaveShown(true); return; }
    const t = setTimeout(() => setWaveShown(false), 260);
    return () => clearTimeout(t);
  }, [ptt.active]);
  const thinking = !listening && phase === "thinking";
  // The slit follows the conversation, never a clock: the rider's wave →
  // the same line settled while CoSiMo thinks → the spoken sentence as a
  // subtitle → that sentence stays with ↻ for a while → the destination
  // board. A card (a question) takes the slit whenever one is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Subtitles are the `showText` presentation setting (set_presentation /
  // persona): on → the spoken sentence in the slit; off → face and voice only.
  const captionText = show ? show.caption : showText ? cosimo.caption || cosimo.reply : "";
  const speakingNow = speaking && !listening && Boolean(captionText);
  const afterReply = !show && showText && !speakingNow && cosimo.lastReplyAt > 0 && now - cosimo.lastReplyAt < 8000 && Boolean(captionText);
  const slitMode: "wave" | "calm" | "caption" | "card" | "idle" =
    waveShown || (show && listening) ? "wave" : thinking ? "calm" : !show && cosimo.card ? "card" : speakingNow || afterReply ? "caption" : "idle";
  const showDot = useMinPresence(thinking, THINK_MIN_MS);
  const rimState: keyof StateColors | null = ptt.error ? "error" : listening ? "listening" : speaking ? "speaking" : null;
  // The rim keeps its last colour while fading out, so the fade is not a colour jump.
  const lastRim = useRef<keyof StateColors>("listening");
  if (rimState) lastRim.current = rimState;
  const rimColor = scheme.states[lastRim.current];
  const rimStrength = lastRim.current === "speaking" ? 0.6 : 1;
  const glowRim = (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none", zIndex: 4,
        // not a box-shadow (that paints a band): a radial falloff that only
        // rises in the outer few percent — a thin, soft breath at the rim
        background: `radial-gradient(circle, ${withAlpha(rimColor, 0)} 0%, ${withAlpha(rimColor, 0)} 89%, ${withAlpha(rimColor, 0.38 * rimStrength)} 96.5%, ${withAlpha(rimColor, 0.58 * rimStrength)} 100%)`,
        opacity: rimState ? 1 : 0,
        transition: "opacity 500ms ease, background 300ms ease",
      }}
    />
  );
  // The ground's "Wabern": while CoSiMo thinks or speaks the WHOLE ground —
  // the full window in a browser, the full screen on the iPad — carries a
  // soft wash of the theme's colour whose bright regions drift and swell.
  // Oversized gradient sheets on different slow orbits, so the motion never
  // visibly repeats and no edge ever shows. While speaking the wash follows
  // the VOICE: the same envelope that drives the mouth (`--voice`, 0–1,
  // attack fast / release slow) lifts the sheets and lights a third one, so
  // the room breathes with each phrase. Thinking: a slow synthetic pulse.
  // Idle: plain ground. Reduced motion: a still, faint tint.
  const wabering = (!listening && phase === "thinking") || (speaking && !listening);
  // the THEME's colour (its ink — what the colour swatches show), not the
  // semantic state colours: the ground says which CoSiMo this is, the rim says what it does
  // on the black cabin ground the theme's light tint glows (its ink would
  // be invisible on black); on the emulator's off-white ground the ink
  const waberColor = panel ? scheme.ink : scheme.bg;
  const waberRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = waberRef.current;
    if (!el || !wabering) return;
    let raf = 0;
    let level = 0;
    const t0 = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const drive = speaking ? mouthDrive?.() : null;
      // gentle: the mouth envelope is made for a mouth; the room only needs
      // its slow shape — damped, slow attack, slower release, never a flash
      const target = drive ? Math.min(1, drive.open * 0.7) : 0.18 + 0.14 * Math.sin((performance.now() - t0) / 900);
      level += (target - level) * (target > level ? 0.06 : 0.03);
      el.style.setProperty("--voice", level.toFixed(3));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wabering, speaking, mouthDrive]);
  const sheet = (gradient: string, drift: string, breathe: string, delay: string, base: number, voice: number) => (
    <div
      aria-hidden
      style={{
        // oversized and centred, so translating/scaling it never reveals a corner
        position: "absolute", left: "-25%", top: "-25%", width: "150%", height: "150%", pointerEvents: "none",
        background: gradient,
        opacity: `calc(${base} + ${voice} * var(--voice, 0))`,
        animation: reduceMotion ? "none" : `cosimo-drift ${drift} ease-in-out infinite alternate, cosimo-swell ${breathe} ease-in-out infinite`,
        animationDelay: delay,
      }}
    />
  );
  const groundWaber = (
    <div
      ref={waberRef}
      aria-hidden
      style={{
        position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0,
        // base tint over the whole surface; the sheets add the moving light
        background: withAlpha(waberColor, 0.12),
        opacity: wabering ? 1 : 0,
        transition: "opacity 900ms ease",
      }}
    >
      {sheet(`radial-gradient(60% 55% at 35% 40%, ${withAlpha(waberColor, 0.4)} 0%, ${withAlpha(waberColor, 0)} 100%)`, "15s", "5.5s", "0s", 0.75, 0.15)}
      {sheet(`radial-gradient(55% 60% at 68% 62%, ${withAlpha(waberColor, 0.34)} 0%, ${withAlpha(waberColor, 0)} 100%)`, "21s", "7.4s", "-5s", 0.7, 0.18)}
      {/* the voice sheet: dark while silent, lights up with each phrase */}
      {sheet(`radial-gradient(70% 45% at 50% 52%, ${withAlpha(waberColor, 0.36)} 0%, ${withAlpha(waberColor, 0)} 100%)`, "11s", "4.6s", "-2s", 0.08, 0.32)}
    </div>
  );
  const glowDot = (
    <div
      aria-hidden
      style={{
        // the orbit: a full-size layer that rotates; the dot sits at its top edge
        position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none", zIndex: 4,
        opacity: showDot ? 1 : 0,
        transition: "opacity 350ms ease",
        animation: reduceMotion ? "none" : "cosimo-orbit 2.6s linear infinite",
        animationPlayState: showDot ? "running" : "paused",
      }}
    >
      <div
        style={{
          position: "absolute", left: "50%", top: "1.5%", transform: "translate(-50%, -50%)",
          width: "calc(var(--circle) * 0.055)", height: "calc(var(--circle) * 0.055)", borderRadius: "50%",
          background: `radial-gradient(circle, ${withAlpha(scheme.states.thinking, 0.6)} 0%, ${withAlpha(scheme.states.thinking, 0.28)} 45%, ${withAlpha(scheme.states.thinking, 0)} 70%)`,
        }}
      />
    </div>
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
        background: panel ? "#f4f3f0" : "#000000",
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
      {/* the ground's living colour — the whole surface, beneath the stage */}
      {groundWaber}

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
                // no device frame: on black the iPad simply disappears behind the panel
                outline: "none",
              }),
        }}
      >
        {/* ── circle cutout: the Face ─────────────────────────────── */}
        <div
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={gazeStart}
          onPointerMove={gazeMove}
          onPointerUp={gazeEnd}
          onPointerCancel={gazeEnd}
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
          <style>{`@keyframes cosimo-orbit { to { transform: rotate(360deg) } }
@keyframes cosimo-drift { from { translate: -12% -9% } to { translate: 12% 9% } }
@keyframes cosimo-swell { 0%, 100% { scale: 1 } 50% { scale: 1.24 } }`}</style>
          {glowRim}
          {glowDot}
          <Inset radius="50%" />
          {/* the Face — always centred; text never enters the circle (subtitles
              live in the slit, see showText). reduceMotion stills its idle life. */}
          <div
            ref={faceRef}
            style={{
              position: "absolute",
              // 52%: the artwork's visual mass (eyes mid 125, mouth 104) sits
              // left of its viewBox centre (130) — this optically centres it.
              left: "52%",
              top: "48%",
              transform: "translate(-50%, -50%)",
              width: "88%",
            }}
          >
            <CosimoFaceAnimated
              emotion={faceEmotion}
              idle={!reduceMotion}
              mouthDrive={mouthDrive}
              gazeDrive={gazeDrive}
              style={{ width: "100%", height: "auto", color: scheme.ink, display: "block" }}
            />
          </div>

          {/* only a short phase hint in the circle — the words are the slit's
              subtitles (showText), never text on the face */}
          {(
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
                opacity: 0.55,
              }}
            >
              {show ? "" : PHASE_HINT[cosimo.phase][lang]}
            </div>
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
            // Size container: the strip, cards and chips are sized in cqh of
            // the SLIT (24 mm tall on the panel), not of the whole screen —
            // so type stays legible whatever the calibration says.
            containerType: "size",
            // Safe inline inset for everything inside: the slit's rounded ends
            // (a full pill: radius = half its height) must never cut text.
            // At the text's top/bottom edge the curve sits ~0.3 r inside, so
            // content keeps ~0.62 r + a margin from each end.
            ["--slit-inset" as string]: `calc(min(50cqh, ${layout.slitR}px) * 0.62 + 5cqh)`,
            outline: guide,
            boxShadow: panel ? halo : undefined,
            transition: "background 300ms",
          }}
        >
          <Inset radius={layout.slitR} />
          {slitMode === "wave" || slitMode === "calm" ? (
            /* hold-to-talk: the rider's voice as a line; thinking: the same line, settled */
            <SlitWave sample={ptt.wave.sample} kind={show ? () => "native" : ptt.wave.kind} ink={scheme.ink} leaving={!show && !ptt.active && slitMode === "wave"} calm={slitMode === "calm"} transcript={!show && slitMode === "wave" ? ptt.partial : ""} />
          ) : slitMode === "caption" ? (
            <SlitCaption
              text={captionText}
              telemetry={cosimo.telemetry}
              lang={lang}
              textScale={textScale}
              aside={afterReply ? <RepeatAffordance lastReplyAt={cosimo.lastReplyAt} ink={scheme.ink} onRepeat={cosimo.repeatLast} lang={lang} /> : undefined}
            />
          ) : slitMode === "card" ? (
            <SlitCard
              card={cosimo.card!}
              scheme={scheme}
              textScale={textScale}
              onLocal={(value) => cosimo.answerCard(cosimo.card!.id, value)}
              onModel={(label) => cosimo.send(label, lang, "tap")}
            />
          ) : (
            <TelemetryStrip telemetry={cosimo.telemetry} lang={lang} reduceMotion={reduceMotion} motion={slitMotion} />
          )}
        </div>
      </div>

      {children}
    </main>
  );
}
