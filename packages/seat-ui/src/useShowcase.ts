import { useEffect, useRef, useState } from "react";
import { SCHEME_IDS, SHOWCASE_LINES, type FaceEmotion, type Locale } from "@cosimo/shared";
import { schemeById, type ColorScheme } from "@cosimo/face";

/**
 * Showcase ("Schaustellung"): a seat nobody can reach performs, endlessly
 * and SILENTLY — the face lives, listens, thinks, "speaks" with subtitles
 * (mouth on a synthetic syllable rhythm, no audio), changes its colour,
 * dozes. Runs entirely on the device: no hub turn, no LLM, no TTS. The
 * talk button is ignored while it runs; only the operator menu ends it.
 *
 * Returns the view the SeatView renders instead of the live one, or null
 * when the mode is off.
 */
export interface ShowcaseView {
  emotion: FaceEmotion;
  phase: "idle" | "listening" | "thinking" | "speaking";
  caption: string;
  scheme: ColorScheme;
  /** Synthetic mouth envelope while "speaking" (same contract as the live drive). */
  mouthDrive: () => { open: number; tilt: number } | null;
}

type Scene =
  | { kind: "live"; emotion: FaceEmotion; ms: number }
  | { kind: "listen"; ms: number }
  | { kind: "think"; ms: number }
  | { kind: "speak"; line: number; ms: number }
  | { kind: "theme" }
  | { kind: "sleep"; ms: number };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/** One pass of the programme; lines are drawn without repeats until all were used. */
function programme(lineBag: number[]): Scene[] {
  const draw = () => { if (lineBag.length === 0) lineBag.push(...SHOWCASE_LINES.map((_, i) => i)); return lineBag.splice(Math.floor(Math.random() * lineBag.length), 1)[0]!; };
  const speak = (): Scene => { const line = draw(); const len = Math.max(SHOWCASE_LINES[line]!.de.length, SHOWCASE_LINES[line]!.en.length); return { kind: "speak", line, ms: 900 + len * 65 }; };
  return [
    { kind: "live", emotion: pick(["neutral", "happy", "surprised"] as const), ms: rnd(5000, 9000) },
    { kind: "listen", ms: rnd(2500, 4000) },
    { kind: "think", ms: rnd(2000, 3500) },
    speak(),
    speak(),
    { kind: "live", emotion: "happy", ms: rnd(4000, 7000) },
    { kind: "theme" },
    { kind: "live", emotion: pick(["neutral", "happy"] as const), ms: rnd(4000, 8000) },
    { kind: "listen", ms: rnd(2000, 3500) },
    { kind: "think", ms: rnd(1500, 3000) },
    speak(),
    { kind: "sleep", ms: rnd(7000, 12000) },
    { kind: "live", emotion: "surprised", ms: rnd(2500, 4000) },
  ];
}

export function useShowcase(enabled: boolean, lang: Locale, baseScheme: ColorScheme): ShowcaseView | null {
  const [state, setState] = useState<{ emotion: FaceEmotion; phase: ShowcaseView["phase"]; caption: string; schemeId: string }>({
    emotion: "neutral", phase: "idle", caption: "", schemeId: baseScheme.id,
  });
  const speakStart = useRef(0);
  const speakLen = useRef(0);
  const syllables = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const bag: number[] = [];
    let queue: Scene[] = [];
    let schemeId = baseScheme.id;
    const run = () => {
      if (!alive) return;
      if (queue.length === 0) queue = programme(bag);
      const sc = queue.shift()!;
      let wait = 0;
      switch (sc.kind) {
        case "live": setState((s) => ({ ...s, emotion: sc.emotion, phase: "idle", caption: "" })); wait = sc.ms; break;
        case "listen": setState((s) => ({ ...s, emotion: "listening", phase: "listening", caption: "" })); wait = sc.ms; break;
        case "think": setState((s) => ({ ...s, emotion: "thinking", phase: "thinking", caption: "" })); wait = sc.ms; break;
        case "speak": {
          const text = SHOWCASE_LINES[sc.line]![lang];
          // a syllable amplitude per ~5 letters, so the mouth has a rhythm the eye can follow
          syllables.current = Array.from({ length: Math.max(3, Math.round(text.length / 4.5)) }, () => 0.45 + Math.random() * 0.55);
          speakStart.current = performance.now();
          speakLen.current = sc.ms - 400;
          setState((s) => ({ ...s, emotion: "speaking", phase: "speaking", caption: text }));
          wait = sc.ms + 500;
          break;
        }
        case "theme": {
          const others = SCHEME_IDS.filter((id) => id !== schemeId);
          schemeId = pick(others);
          setState((s) => ({ ...s, schemeId }));
          wait = 300;
          break;
        }
        case "sleep": setState((s) => ({ ...s, emotion: "sleeping", phase: "idle", caption: "" })); wait = sc.ms; break;
      }
      timer = setTimeout(run, wait);
    };
    run();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [enabled, lang, baseScheme.id]);

  const mouthDrive = useRef((): { open: number; tilt: number } | null => {
    const t = performance.now() - speakStart.current;
    if (t < 0 || t > speakLen.current) return null;
    const sy = syllables.current;
    if (sy.length === 0) return null;
    // ~4.5 syllables per second, each a soft bump scaled by its amplitude
    const pos = (t / 1000) * 4.5;
    const i = Math.min(sy.length - 1, Math.floor(pos));
    const frac = pos - Math.floor(pos);
    const bump = Math.sin(frac * Math.PI);
    return { open: Math.min(1, bump * sy[i]!), tilt: 0.15 * Math.sin(t / 380) };
  }).current;

  if (!enabled) return null;
  return { emotion: state.emotion, phase: state.phase, caption: state.caption, scheme: schemeById(state.schemeId), mouthDrive };
}
