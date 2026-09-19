import type { FaceEmotion } from "@cosimo/shared";
import { IN_TEST, useAmbientClock, useTweenedParams, type ScribbleEntityProps } from "./shared.js";
import ScribbleCanvas from "./ScribbleCanvas.js";
import { wobbleEllipse, wobblePath } from "./wobble.js";
import { useVoice, type MouthDrive } from "./voice.js";

/**
 * Knäuel — a dense tangled ball of pen loops (the eye pupils of the face,
 * grown into a whole creature). Emotion lives in its posture: it bounces
 * when happy, sags into a puddle with a loose thread when sad, flies apart
 * when startled, churns its loops while thinking, and curls up tight to
 * sleep. Its own voice rig: the tangle loosens, swells and churns with the
 * loudness of what is being said (ported from CoSiMo-mockup, 2026-09-19).
 */

interface BlobParams {
  posX: number;
  posY: number;
  /** Overall scale. */
  size: number;
  /** Vertical squash, < 1 flattens (sleep/sad puddle). */
  squashY: number;
  /** Multiplier on each loop's offset from centre; > 1 loosens the tangle. */
  spread: number;
  /** Swirls every loop around its own centre (thinking). */
  churn: number;
  tilt: number;
  /** Loose thread drooping out of the tangle (sad). */
  droop: number;
  /** Detached startle loops and flecks (surprised). */
  burst: number;
}

const BLOB_STATES: Record<FaceEmotion, BlobParams> = {
  neutral: { posX: 0, posY: 4, size: 1, squashY: 1, spread: 1, churn: 0, tilt: 0, droop: 0, burst: 0 },
  happy: { posX: 0, posY: -8, size: 1.06, squashY: 1, spread: 1.1, churn: 0.2, tilt: -5, droop: 0, burst: 0 },
  thinking: { posX: -10, posY: -10, size: 0.96, squashY: 1, spread: 0.92, churn: 1, tilt: 8, droop: 0, burst: 0 },
  listening: { posX: 9, posY: 0, size: 0.95, squashY: 1, spread: 0.88, churn: 0, tilt: 11, droop: 0, burst: 0 },
  speaking: { posX: 0, posY: 0, size: 1.03, squashY: 1, spread: 1.06, churn: 0.15, tilt: 0, droop: 0, burst: 0 },
  sleeping: { posX: 0, posY: 28, size: 0.97, squashY: 0.6, spread: 0.84, churn: 0, tilt: 3, droop: 0, burst: 0 },
  sad: { posX: 0, posY: 20, size: 0.96, squashY: 0.76, spread: 0.96, churn: 0, tilt: -7, droop: 1, burst: 0 },
  surprised: { posX: 0, posY: -6, size: 1.1, squashY: 1.04, spread: 1.55, churn: 0.35, tilt: 2, droop: 0, burst: 1 },
};

const C = { x: 130, y: 100 };

/* The tangle: overlapping loops of decreasing size, hand-arranged so the
   pen seems to have circled the same spot again and again. */
const LOOPS = [
  { dx: 0, dy: 0, rx: 62, ry: 55, rot: -10 },
  { dx: 14, dy: -11, rx: 50, ry: 48, rot: 25 },
  { dx: -18, dy: 7, rx: 55, ry: 43, rot: -35 },
  { dx: 7, dy: 14, rx: 48, ry: 50, rot: 60 },
  { dx: -7, dy: -18, rx: 43, ry: 49, rot: 10 },
  { dx: 22, dy: 4, rx: 41, ry: 36, rot: -60 },
  { dx: -22, dy: -4, rx: 36, ry: 41, rot: 40 },
  { dx: 4, dy: -4, rx: 25, ry: 22, rot: 0 },
  { dx: -4, dy: 11, rx: 18, ry: 20, rot: 30 },
];

/* Loose thread hanging out of the tangle when sad — drawn inside the body
   group so it sags with the puddle. */
const DROOP_THREAD = "M118 150 C114 178, 108 192, 97 199 C91 204, 85 202, 86 196";
const DROOP_W = wobblePath(DROOP_THREAD, 37);

/* Startle debris: two escaped loops and four flecks, shown when surprised. */
const BURST_BITS = (
  <>
    <path d={wobbleEllipse(38, 36, 9, 8, 31, -20)} />
    <path d={wobbleEllipse(224, 30, 8, 7, 32, 25)} />
    <path d={wobblePath("M30 56 L18 44", 33)} />
    <path d={wobblePath("M232 48 L245 36", 34)} />
    <path d={wobblePath("M86 12 L78 1", 35)} />
    <path d={wobblePath("M178 10 L186 0", 36)} />
  </>
);

/**
 * Idle motion in the blob's own physics: it is a soft mass, so it breathes,
 * jiggles like jelly and churns its loops. All modulations are zero at t=0,
 * so a disabled clock rests exactly on the pose.
 */
function withAmbient(p: BlobParams, emotion: FaceEmotion, t: number): BlobParams {
  const q = { ...p };
  switch (emotion) {
    case "neutral": {
      // at rest the tangle is a creature, not an ornament: it breathes
      // visibly (~5 s), drifts a little on two slow, incommensurate paths,
      // sways, and every ~12 s its loops settle with a lazy churn
      q.size *= 1 + 0.03 * Math.sin(t * 1.1);
      q.posX += 6 * Math.sin(t * 0.37) + 2 * Math.sin(t * 0.91);
      q.posY += 4 * Math.sin(t * 0.53);
      q.tilt += 3 * Math.sin(t * 0.29);
      q.churn += 0.12 * (1 + Math.sin(t * 0.52)) * Math.max(0, Math.sin(t * 0.26));
      q.spread *= 1 + 0.03 * Math.sin(t * 0.44);
      break;
    }
    case "happy": {
      const bounce = Math.abs(Math.sin(t * 2.4)); // unhurried hops
      q.posY -= 13 * bounce;
      q.squashY *= 1 - 0.1 * (bounce - 0.5);
      break;
    }
    case "thinking":
      q.churn += t * 0.35;
      q.posX += 2.5 * Math.sin(t * 0.5);
      q.posY += 2 * Math.sin(t * 0.7);
      break;
    case "listening":
      q.tilt += 1.6 * Math.sin(t * 0.9);
      q.size *= 1 + 0.015 * Math.sin(t * 1.6);
      break;
    case "speaking":
      q.size *= 1 + 0.025 * Math.sin(t * 14) + 0.015 * Math.sin(t * 23);
      break;
    case "sleeping":
      q.squashY *= 1 + 0.06 * Math.sin(t * 0.8);
      break;
    case "sad":
      q.squashY *= 1 + 0.02 * Math.sin(t * 0.5);
      break;
    case "surprised":
      q.tilt += 0.7 * Math.sin(t * 28);
      q.spread += 0.02 * Math.sin(t * 9);
      break;
  }
  return q;
}

/** The voice rig: loudness loosens and swells the tangle, brightness churns it. */
function withVoice(p: BlobParams, v: { open: number; tilt: number }): BlobParams {
  if (v.open <= 0.001) return p;
  return { ...p, spread: p.spread * (1 + 0.35 * v.open), size: p.size * (1 + 0.08 * v.open), churn: p.churn + 0.3 * v.open * (0.5 + v.tilt) };
}

export default function ScribbleBlob({
  emotion, className, strokeWidth = 4.5, style, transitionMs, idle = true, mouthDrive,
}: ScribbleEntityProps & { mouthDrive?: MouthDrive; gazeDrive?: unknown }) {
  const duration = transitionMs ?? (IN_TEST ? 0 : 350);
  const tweened = useTweenedParams(BLOB_STATES[emotion], duration);
  // the frame clock runs for the idle physics AND for the voice rig — with
  // reduced motion the idle physics stay off, but the form still follows the
  // voice (otherwise it would freeze while speaking)
  const speakingWithVoice = emotion === "speaking" && Boolean(mouthDrive);
  const t = useAmbientClock((idle || speakingWithVoice) && !IN_TEST);
  const voice = useVoice(mouthDrive, emotion === "speaking");
  const p = withVoice(idle ? withAmbient(tweened, emotion, t) : tweened, voice);

  const bodyTransform =
    `translate(${C.x + p.posX} ${C.y + p.posY}) rotate(${p.tilt})` +
    ` scale(${p.size} ${p.size * p.squashY}) translate(${-C.x} ${-C.y})`;

  return (
    <ScribbleCanvas className={className} style={style} strokeWidth={strokeWidth}>
      {() => (
        <g transform={bodyTransform} data-part="body">
          {LOOPS.map((l, i) => {
            const lx = C.x + l.dx * p.spread;
            const ly = C.y + l.dy * p.spread;
            const swirl = l.rot + p.churn * (i % 2 ? 14 + i * 3 : -(12 + i * 2));
            return <path key={i} d={wobbleEllipse(lx, ly, l.rx, l.ry, 40 + i, swirl)} />;
          })}
          {p.droop > 0.02 && <path opacity={p.droop} d={DROOP_W} />}
          {p.burst > 0.02 && <g opacity={p.burst}>{BURST_BITS}</g>}
        </g>
      )}
    </ScribbleCanvas>
  );
}
