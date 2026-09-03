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
}: {
  sample: (out: Float32Array) => boolean;
  kind: () => "audio" | "native" | null;
  ink: string;
}) {
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
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      const t = (performance.now() - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
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
      const amp = real ? h * (0.04 + 0.38 * level) : h * (0.06 + 0.04 * Math.sin(t * 1.6));

      ctx.beginPath();
      for (let i = 0; i < N; i++) {
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
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", animation: "slit-in 120ms ease-out" }}
    />
  );
}
