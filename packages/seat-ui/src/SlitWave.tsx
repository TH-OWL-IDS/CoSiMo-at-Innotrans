import { useEffect, useRef } from "react";

/**
 * The slit while the talk button is held: one ink-coloured line running
 * across the cutout that becomes the rider's voice — an oscilloscope, not
 * an equaliser. Drawn from the real captured signal when we have one
 * (server STT, browser dev). Under Apple dictation the mic belongs to the
 * recognizer and there are no samples; then the line breathes slowly and
 * evenly — an honest "listening", never a fake voice.
 *
 * Under the line, small: what the recognizer has understood so far. The
 * text is anchored at its END, so a long sentence runs out of the slit to
 * the left and the last words — the ones being spoken — stay in view.
 * Before any words (and while CoSiMo thinks) the same band carries the
 * phase, left-anchored: "Hört zu …" / "Denkt nach …".
 *
 * Thinking (`calm`): the settled line plus one dot travelling along it,
 * right to left and back — the thinking animation lives here, not in the
 * circle (the face stays a face).
 */
export default function SlitWave({
  sample,
  kind,
  ink,
  leaving = false,
  calm = false,
  transcript = "",
  label = "",
}: {
  sample: (out: Float32Array) => boolean;
  kind: () => "audio" | "native" | null;
  ink: string;
  /** Release: the line settles flat and fades out (the parent unmounts after). */
  leaving?: boolean;
  /** Thinking: the same line, settled to a quiet slow breath — "heard you,
   *  working on it". No progress, no promise of a duration. */
  calm?: boolean;
  /** Live dictation so far (empty = nothing yet; the line stays centred). */
  transcript?: string;
  /** Phase word for the lower band while there is no transcript. */
  label?: string;
}) {
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;
  const calmRef = useRef(calm);
  calmRef.current = calm;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const buf = new Float32Array(512);
    const N = 160; // points across the slit
    let raf = 0;
    const t0 = performance.now();
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    // Soft by design: the line is a smooth, slowly drifting wave whose
    // AMPLITUDE follows the voice (attack fast, release slow), not the raw
    // samples — it swells and settles like breathing instead of jittering.
    let level = 0;
    const REVEAL_MS = 380;
    const LEAVE_MS = 260;
    let leaveAt: number | null = null;
    let calmLevel = 0;
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      const now = performance.now();
      const t = (now - t0) / 1000;
      // reveal: the line draws itself in from the left while its swing
      // grows; leave: swing collapses and the stroke fades
      const reveal = easeOut(Math.min(1, (now - t0) / REVEAL_MS));
      if (leavingRef.current && leaveAt === null) leaveAt = now;
      const leave = leaveAt === null ? 0 : Math.min(1, (now - leaveAt) / LEAVE_MS);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 1 - easeOut(leave);
      ctx.lineWidth = Math.max(2, h * 0.04);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = ink;

      const real = !calmRef.current && kind() === "audio" && sample(buf);
      let target = 0;
      if (real) {
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
        // RMS lifted into a useful range; quiet room ≈ 0, speech ≈ 0.5–1
        target = Math.min(1, Math.sqrt(sum / buf.length) * 6);
      }
      level += (target - level) * (target > level ? 0.18 : 0.06);
      // amplitude: a floor so the line is never dead flat, then the voice
      const amp = (real
        ? h * (0.04 + 0.38 * level)
        : calmRef.current
          ? h * (0.035 + 0.02 * Math.sin(t * 1.1)) // settled: barely there, slow
          : h * (0.06 + 0.04 * Math.sin(t * 1.6))) * reveal * (1 - leave);

      // two slow sines, drifting against each other, tapered at both ends
      const yAt = (u: number) => mid + (Math.sin(u * Math.PI * 3 - t * 2.2) * 0.7 + Math.sin(u * Math.PI * 5 + t * 1.3) * 0.3) * amp * Math.sin(u * Math.PI);
      ctx.beginPath();
      const drawn = Math.max(2, Math.round(N * reveal));
      for (let i = 0; i < drawn; i++) {
        const u = i / (N - 1);
        const x = u * w;
        const y = yAt(u);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // thinking: one dot rides the line, right → left → right, easing at
      // the ends (a cosine), one pass ≈ 1.4 s; it fades in with the calm
      calmLevel += ((calmRef.current ? 1 : 0) - calmLevel) * 0.08;
      if (calmLevel > 0.01) {
        const span = 0.12; // stays clear of the slit's rounded ends
        const u = span + (1 - 2 * span) * (0.5 + 0.5 * Math.cos((now - t0) / 1400 * Math.PI));
        const r = Math.max(3, h * 0.075);
        ctx.globalAlpha = (1 - easeOut(leave)) * calmLevel;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(u * w, yAt(u), r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [sample, kind, ink]);

  const hasText = transcript.trim().length > 0;
  const hasLabel = !hasText && label.trim().length > 0;
  const band = hasText || hasLabel;
  return (
    <>
      {/* the line lifts a little once the band has words, leaving it to them */}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          // explicit height: a canvas is a replaced element and would ignore
          // `bottom`, falling back to its intrinsic pixel size
          position: "absolute", left: 0, top: 0, width: "100%",
          height: band ? "calc(100% - 30cqh)" : "100%",
          display: "block", transition: "height 220ms ease",
        }}
      />
      {/* the phase, left — until the first understood words replace it */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "absolute", left: "var(--slit-inset, 7cqh)", bottom: "9cqh",
          fontSize: "clamp(10px, 15cqh, 30px)", fontWeight: 500, lineHeight: 1.2, color: ink, whiteSpace: "nowrap",
          opacity: hasLabel ? 0.55 : 0, transition: "opacity 180ms ease", pointerEvents: "none",
        }}
      >
        {label}
      </div>
      <div
        aria-live="off"
        style={{
          position: "absolute", left: "var(--slit-inset, 7cqh)", right: "var(--slit-inset, 7cqh)", bottom: "9cqh",
          display: "flex", justifyContent: "flex-end", overflow: "hidden",
          fontSize: "clamp(10px, 15cqh, 30px)", fontWeight: 500, lineHeight: 1.2, color: ink,
          opacity: hasText ? 0.6 : 0, transition: "opacity 180ms ease",
          // the start of an overlong sentence fades out at the left edge instead of being chopped
          maskImage: "linear-gradient(to right, transparent, #000 14%)",
          WebkitMaskImage: "linear-gradient(to right, transparent, #000 14%)",
          pointerEvents: "none",
        }}
      >
        <span style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}>{transcript}</span>
      </div>
    </>
  );
}
