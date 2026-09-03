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
    const smooth = new Float32Array(N);
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

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      const t = (performance.now() - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = Math.max(2, h * 0.035);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = ink;
      ctx.beginPath();
      const real = kind() === "audio" && sample(buf);
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * w;
        let y: number;
        if (real) {
          // mic signals are small — lift them, cap at the slit's edge
          const s = buf[Math.floor((i / N) * buf.length)]! * 3.2;
          const target = Math.max(-1, Math.min(1, s)) * h * 0.42;
          // a little temporal smoothing so single frames don't jitter
          smooth[i] = smooth[i]! * 0.35 + target * 0.65;
          y = mid + smooth[i]!;
        } else {
          // listening, no samples: a slow, even breath across the strip
          const env = 0.06 + 0.04 * Math.sin(t * 1.6);
          y = mid + Math.sin((i / N) * Math.PI * 4 - t * 2.4) * h * env;
        }
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
