import { useEffect, useRef } from "react";

/**
 * The slit while the talk button is held: one ink-coloured line running
 * across the cutout that becomes the rider's voice — an oscilloscope, not
 * an equaliser. Drawn from the real captured signal when we have one
 * (server STT, browser dev). Under Apple dictation the mic belongs to the
 * recognizer and there are no samples; then the line breathes slowly and
 * evenly — an honest "listening", never a fake voice.
 */
export default function SlitWave({
  sample,
  kind,
  ink,
  leaving = false,
}: {
  sample: (out: Float32Array) => boolean;
  kind: () => "audio" | "native" | null;
  ink: string;
  /** Release: the line settles flat and fades out (the parent unmounts after). */
  leaving?: boolean;
}) {
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;
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

      const real = kind() === "audio" && sample(buf);
      let target = 0;
      if (real) {
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
        // RMS lifted into a useful range; quiet room ≈ 0, speech ≈ 0.5–1
        target = Math.min(1, Math.sqrt(sum / buf.length) * 6);
      }
      level += (target - level) * (target > level ? 0.18 : 0.06);
      // amplitude: a floor so the line is never dead flat, then the voice
      const amp = (real ? h * (0.04 + 0.38 * level) : h * (0.06 + 0.04 * Math.sin(t * 1.6))) * reveal * (1 - leave);

      ctx.beginPath();
      const drawn = Math.max(2, Math.round(N * reveal));
      for (let i = 0; i < drawn; i++) {
        const u = i / (N - 1);
        const x = u * w;
        // two slow sines, drifting against each other, tapered at both ends
        const taper = Math.sin(u * Math.PI);
        const shape = Math.sin(u * Math.PI * 3 - t * 2.2) * 0.7 + Math.sin(u * Math.PI * 5 + t * 1.3) * 0.3;
        const y = mid + shape * amp * taper;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [sample, kind, ink]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
    />
  );
}
