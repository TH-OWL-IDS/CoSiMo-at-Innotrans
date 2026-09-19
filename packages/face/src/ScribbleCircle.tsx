import type { FaceEmotion } from "@cosimo/shared";
import { IN_TEST, smoothPath, useAmbientClock, useTweenedParams, type Pt, type ScribbleEntityProps } from "./shared.js";
import ScribbleCanvas from "./ScribbleCanvas.js";
import { wobblePath } from "./wobble.js";
import { useVoice, type MouthDrive } from "./voice.js";

/**
 * Kreis — a single hand-drawn ring: the pen goes around about one and a half
 * times, the laps slightly offset, the ends never quite meeting. The most
 * minimal entity; everything is squash & stretch: it deflates into a sagging
 * egg when sad, snaps wide open when startled (the pen gap gapes), narrows
 * and tilts to think, and flattens into a slowly breathing pancake to sleep.
 * Its own voice rig: the rim resonates with the loudness (ported from
 * CoSiMo-mockup, 2026-09-19).
 */

interface CircleParams {
  rx: number;
  ry: number;
  turns: number;
  tilt: number;
  posX: number;
  posY: number;
  deflate: number;
}

const CIRCLE_STATES: Record<FaceEmotion, CircleParams> = {
  neutral: { rx: 1, ry: 1, turns: 1.55, tilt: 0, posX: 0, posY: 2, deflate: 0 },
  happy: { rx: 0.98, ry: 1.08, turns: 1.6, tilt: -3, posX: 0, posY: -8, deflate: 0 },
  thinking: { rx: 0.8, ry: 1, turns: 1.5, tilt: 16, posX: -8, posY: -6, deflate: 0 },
  listening: { rx: 0.94, ry: 0.98, turns: 1.55, tilt: -10, posX: 6, posY: 0, deflate: 0 },
  speaking: { rx: 0.97, ry: 1.02, turns: 1.55, tilt: 0, posX: 0, posY: 0, deflate: 0 },
  sleeping: { rx: 1.15, ry: 0.45, turns: 1.5, tilt: 0, posX: 0, posY: 30, deflate: 0.3 },
  sad: { rx: 0.95, ry: 0.82, turns: 1.45, tilt: -8, posX: 0, posY: 16, deflate: 0.55 },
  surprised: { rx: 1.2, ry: 1.16, turns: 1.15, tilt: 6, posX: 0, posY: -4, deflate: 0 },
};

const C = { x: 130, y: 100 };
const R = 80;

function ringPath(p: CircleParams): string {
  const start = (210 * Math.PI) / 180;
  const total = p.turns * Math.PI * 2;
  const steps = Math.max(12, Math.round(total / (Math.PI / 10)));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * total;
    const drift = 1 + 0.09 * (t - 0.5);
    const wobble = 1 + 0.025 * Math.sin(a * 3 + 1);
    const px = Math.cos(a) * R * p.rx * drift * wobble;
    let py = Math.sin(a) * R * p.ry * drift * wobble;
    py *= py > 0 ? 1 + 0.6 * p.deflate : 1 - 0.35 * p.deflate;
    pts.push([C.x + p.posX + px, C.y + p.posY + py]);
  }
  return smoothPath(pts);
}

function withAmbient(p: CircleParams, emotion: FaceEmotion, t: number): CircleParams {
  const q = { ...p };
  switch (emotion) {
    case "neutral": {
      // at rest: a visible breath (~5 s), the pen's gap wandering slowly
      // around the ring (a full lap in ~40 s), a gentle drift and sway
      const b = 0.028 * Math.sin(t * 1.15);
      q.rx *= 1 + b;
      q.ry *= 1 - b * 0.8;
      q.tilt += (t * 9) % 360; // the gap travels (the rotation carries it)
      q.tilt += 3 * Math.sin(t * 0.33);
      q.posX += 4 * Math.sin(t * 0.41);
      q.posY += 3 * Math.sin(t * 0.57);
      break;
    }
    case "happy": {
      const bounce = Math.abs(Math.sin(t * 2.4)); // unhurried hops
      q.posY -= 13 * bounce;
      q.ry *= 1 + 0.08 * (bounce - 0.5);
      q.rx *= 1 - 0.08 * (bounce - 0.5);
      break;
    }
    case "thinking":
      q.tilt += 6 * Math.sin(t * 0.9);
      break;
    case "listening":
      q.tilt += 2.5 * Math.sin(t * 1.0);
      q.rx *= 1 + 0.01 * Math.sin(t * 1.7);
      break;
    case "speaking": {
      const w = 0.045 * Math.sin(t * 11);
      q.rx *= 1 + w;
      q.ry *= 1 - w;
      break;
    }
    case "sleeping":
      q.ry *= 1 + 0.08 * Math.sin(t * 0.75);
      break;
    case "sad":
      q.ry *= 1 + 0.015 * Math.sin(t * 0.5);
      break;
    case "surprised":
      q.rx *= 1 + 0.012 * Math.sin(t * 26);
      q.ry *= 1 + 0.012 * Math.sin(t * 26 + 1.5);
      q.tilt += 0.5 * Math.sin(t * 21);
      break;
  }
  return q;
}

/** The voice rig: the rim swells with the loudness and opens its gap a touch. */
function withVoice(p: CircleParams, v: { open: number; tilt: number }): CircleParams {
  if (v.open <= 0.001) return p;
  return { ...p, rx: p.rx * (1 + 0.12 * v.open), ry: p.ry * (1 + 0.06 * v.open), turns: p.turns - 0.1 * v.open * v.tilt };
}

export default function ScribbleCircle({
  emotion, className, strokeWidth = 4.5, style, transitionMs, idle = true, mouthDrive,
}: ScribbleEntityProps & { mouthDrive?: MouthDrive; gazeDrive?: unknown }) {
  const duration = transitionMs ?? (IN_TEST ? 0 : 350);
  const tweened = useTweenedParams(CIRCLE_STATES[emotion], duration);
  // the frame clock runs for the idle physics AND for the voice rig — with
  // reduced motion the idle physics stay off, but the form still follows the
  // voice (otherwise it would freeze while speaking)
  const speakingWithVoice = emotion === "speaking" && Boolean(mouthDrive);
  const t = useAmbientClock((idle || speakingWithVoice) && !IN_TEST);
  const voice = useVoice(mouthDrive, emotion === "speaking");
  const p = withVoice(idle ? withAmbient(tweened, emotion, t) : tweened, voice);

  return (
    <ScribbleCanvas className={className} style={style} strokeWidth={strokeWidth}>
      {() => (
        <g transform={`rotate(${p.tilt} ${C.x + p.posX} ${C.y + p.posY})`}>
          <path data-part="ring" d={wobblePath(ringPath(p), 11)} />
        </g>
      )}
    </ScribbleCanvas>
  );
}
