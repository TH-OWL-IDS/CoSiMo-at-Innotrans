"use client";

import { useEffect, useMemo, useRef } from "react";
import { gsap } from "gsap";
import { FACE_STATES, type FaceParams } from "./states.js";
import { IN_TEST, type ScribbleEntityProps } from "./shared.js";
import ScribbleCanvas from "./ScribbleCanvas.js";
import {
  EYE_L,
  EYE_R,
  NOSE_D,
  computeScribbleFrame,
  faceAmbient,
  restIdle,
  type ScribbleFrame,
} from "./scribbleRig.js";

/**
 * The CoSiMo face, animatable between expressions. Geometry is traced from
 * the original scribble artwork: eyes are nests of overlapping loops with a
 * dense filled pupil, the nose a short soft stroke, the mouth a single lazy
 * asymmetric curve.
 *
 * Engine (GSAP): the SVG structure renders ONCE; every part holds a ref.
 * Emotion changes tween the numeric FaceParams with `gsap.to`, and a
 * `gsap.ticker` loop layers the idle life (blinks, saccades, breathing, head
 * turns — see scribbleRig.faceAmbient) on top and writes the resulting
 * attributes straight into the DOM. React never re-renders for animation —
 * on the iPad minis that keeps 60 fps cheap, and GSAP timelines are available
 * for choreographed moments.
 *
 * The rig itself (poses, idle math, frame computation) is pure and lives in
 * scribbleRig.ts — the first "face pack"; a future face swaps the artwork
 * and frame computer while keeping the same FaceParams axes.
 */

const clampS = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The animated node refs — one per rig-driven part. */
interface PartRefs {
  root: SVGGElement | null;
  browL: SVGPathElement | null;
  browR: SVGPathElement | null;
  eyeL: SVGGElement | null;
  eyeR: SVGGElement | null;
  nestL: SVGGElement | null;
  nestR: SVGGElement | null;
  pupilL: SVGGElement | null;
  pupilR: SVGGElement | null;
  lidL: SVGPathElement | null;
  lidR: SVGPathElement | null;
  nose: SVGPathElement | null;
  mouth: SVGPathElement | null;
}

/** Write one frame into the DOM. Cheap: 13 setAttribute groups, no layout. */
function applyFrame(r: PartRefs, f: ScribbleFrame): void {
  r.root?.setAttribute("transform", f.root.transform);
  if (r.browL) { r.browL.setAttribute("d", f.browL.d); r.browL.setAttribute("transform", f.browL.transform); }
  if (r.browR) { r.browR.setAttribute("d", f.browR.d); r.browR.setAttribute("transform", f.browR.transform); }
  r.eyeL?.setAttribute("transform", f.eyeL.transform);
  r.eyeR?.setAttribute("transform", f.eyeR.transform);
  if (r.nestL) { r.nestL.setAttribute("transform", f.nestL.transform); r.nestL.setAttribute("opacity", String(f.nestL.opacity)); }
  if (r.nestR) { r.nestR.setAttribute("transform", f.nestR.transform); r.nestR.setAttribute("opacity", String(f.nestR.opacity)); }
  r.pupilL?.setAttribute("transform", f.pupilL.transform);
  r.pupilR?.setAttribute("transform", f.pupilR.transform);
  if (r.lidL) { r.lidL.setAttribute("d", f.lidL.d); r.lidL.setAttribute("opacity", String(f.lidL.opacity)); }
  if (r.lidR) { r.lidR.setAttribute("d", f.lidR.d); r.lidR.setAttribute("opacity", String(f.lidR.opacity)); }
  r.nose?.setAttribute("transform", f.nose.transform);
  r.mouth?.setAttribute("d", f.mouth.d);
}

/** One eye's STATIC artwork (loops, lash, pupil, catchlight, lid). The rig
 *  only ever touches the group transforms / opacities / the lid path. */
function EyeArt({
  side,
  refs,
  frame,
}: {
  side: "L" | "R";
  refs: React.MutableRefObject<PartRefs>;
  /** Initial/current attribute values, so the first paint (and every React
   *  re-render, incl. under test) already shows the rigged pose. */
  frame: ScribbleFrame;
}) {
  const { x, y } = side === "L" ? EYE_L : EYE_R;
  const isL = side === "L";
  const eye = isL ? frame.eyeL : frame.eyeR;
  const nest = isL ? frame.nestL : frame.nestR;
  const pupil = isL ? frame.pupilL : frame.pupilR;
  const lid = isL ? frame.lidL : frame.lidR;
  return (
    <g
      data-part={isL ? "eye-left" : "eye-right"}
      ref={(el) => { refs.current[isL ? "eyeL" : "eyeR"] = el; }}
      transform={eye.transform}
    >
      {/* single outer lash — a short plain flick */}
      {isL ? (
        <path d={`M${x - 16} ${y - 10} L${x - 22.5} ${y - 15.5}`} />
      ) : (
        <path d={`M${x + 14} ${y - 9.5} L${x + 20.5} ${y - 14.5}`} />
      )}
      <g
        ref={(el) => { refs.current[isL ? "nestL" : "nestR"] = el; }}
        transform={nest.transform}
        opacity={nest.opacity}
      >
        {isL ? (
          <ellipse cx={x} cy={y} rx={17} ry={19} transform={`rotate(-8 ${x} ${y})`} />
        ) : (
          <ellipse cx={x} cy={y} rx={16} ry={17} transform={`rotate(12 ${x} ${y})`} />
        )}
        {/* pupil — dense filled blob, slightly low in the nest */}
        <g
          data-part={isL ? "pupil-left" : "pupil-right"}
          ref={(el) => { refs.current[isL ? "pupilL" : "pupilR"] = el; }}
          transform={pupil.transform}
        >
          {isL ? (
            <>
              <circle cx={x - 2} cy={y + 2} r={8} fill="currentColor" stroke="none" />
              {/* catchlight — matching glint, same light direction */}
              <circle cx={x - 5} cy={y - 1} r={2.2} fill="white" stroke="none" />
              <ellipse cx={x - 1} cy={y + 2} rx={10.5} ry={9} />
            </>
          ) : (
            <>
              <circle cx={x - 1} cy={y + 2} r={7.5} fill="currentColor" stroke="none" />
              {/* catchlight — a tiny unfilled spot for a glint of life */}
              <circle cx={x - 4} cy={y - 1} r={2} fill="white" stroke="none" />
              <ellipse cx={x - 1} cy={y + 2} rx={9.5} ry={8.5} />
            </>
          )}
        </g>
      </g>
      <path
        ref={(el) => { refs.current[isL ? "lidL" : "lidR"] = el; }}
        d={lid.d}
        opacity={lid.opacity}
      />
    </g>
  );
}

export default function CosimoFaceAnimated({
  emotion,
  className,
  strokeWidth = 4.5,
  style,
  transitionMs,
  idle = true,
  gazeY,
  mouthDrive,
  gazeDrive,
}: ScribbleEntityProps & {
  /**
   * Live gaze target (-1…1 on each axis, like the rig's gaze), e.g. the
   * rider's finger on the face. Sampled per frame; while it returns a
   * point the eyes ease onto it (wins over the idle wander and `gazeY`),
   * when it returns null they ease back into the idle life. A getter, so
   * pointer moves never re-render React.
   */
  gazeDrive?: () => { x: number; y: number } | null;
  /**
   * Live mouth drive from the actually-playing voice: `open` = loudness
   * envelope (0..1), `tilt` = spectral brightness (0..1). Sampled once per
   * animation frame while `emotion === "speaking"`; when it returns null
   * (no analysable audio, e.g. browser-TTS fallback) the built-in synthetic
   * speech cadence takes over. A getter so no React state churns at 60 fps.
   */
  mouthDrive?: () => { open: number; tilt: number } | null;
}) {
  const duration = transitionMs ?? (IN_TEST ? 0 : 350);
  const ambientOn = idle && !IN_TEST;

  const refs = useRef<PartRefs>({
    root: null, browL: null, browR: null, eyeL: null, eyeR: null,
    nestL: null, nestR: null, pupilL: null, pupilR: null,
    lidL: null, lidR: null, nose: null, mouth: null,
  });
  /** The live pose — GSAP tweens this object; the ticker reads it. */
  const paramsRef = useRef<FaceParams>({ ...FACE_STATES[emotion] });
  const emotionRef = useRef(emotion);
  const gazeYRef = useRef(gazeY);
  gazeYRef.current = gazeY;
  const mouthDriveRef = useRef(mouthDrive);
  mouthDriveRef.current = mouthDrive;
  const gazeDriveRef = useRef(gazeDrive);
  gazeDriveRef.current = gazeDrive;
  /** The eased follow: where the eyes are heading and how much the drive
   *  currently outweighs the idle wander (0 = none, 1 = pinned). */
  const follow = useRef({ x: 0, y: 0, w: 0 });
  /** Last applied frame — re-renders (prop/theme changes) reproduce it, so
   *  React reconciliation never snaps the face to a stale pose. */
  const lastFrameRef = useRef<ScribbleFrame | null>(null);

  // Emotion morph: tween the numeric pose (any pose → any pose, no path
  // mismatches). Under test / duration 0 the pose snaps.
  useEffect(() => {
    emotionRef.current = emotion;
    const target = FACE_STATES[emotion];
    gsap.killTweensOf(paramsRef.current);
    if (duration <= 0 || IN_TEST) {
      Object.assign(paramsRef.current, target);
      return;
    }
    gsap.to(paramsRef.current, {
      ...target,
      duration: duration / 1000,
      ease: "power2.out",
      overwrite: "auto",
    });
  }, [emotion, duration]);

  // The frame loop: idle life + gaze/mouth overrides → frame → DOM.
  useEffect(() => {
    if (IN_TEST || typeof requestAnimationFrame !== "function") return;
    const start = gsap.ticker.time;
    const tick = () => {
      const t = ambientOn ? gsap.ticker.time - start : 0;
      const em = emotionRef.current;
      const target = FACE_STATES[em];
      const rig = ambientOn
        ? faceAmbient(paramsRef.current, t, target, em)
        : restIdle({ ...paramsRef.current });
      // A scene can force the vertical gaze (e.g. glance down at buttons);
      // that wins over the idle wander.
      if (gazeYRef.current != null) rig.p.gazeY = gazeYRef.current;
      // A live gaze target (a finger on the face): ease the eyes onto it,
      // and ease back into the idle life when it lets go.
      const g = gazeDriveRef.current?.() ?? null;
      const f = follow.current;
      if (g) {
        f.x += (g.x - f.x) * 0.25;
        f.y += (g.y - f.y) * 0.25;
        f.w += (1 - f.w) * 0.2;
      } else {
        f.w += (0 - f.w) * 0.08;
      }
      if (f.w > 0.001) {
        rig.p.gazeX = rig.p.gazeX * (1 - f.w) + f.x * f.w;
        rig.p.gazeY = rig.p.gazeY * (1 - f.w) + f.y * f.w;
      }
      // While speaking with real audio available, the mouth follows the
      // VOICE: loudness opens it, brightness widens it. Overrides the
      // synthetic cadence, which remains the fallback without a drive.
      const drive = em === "speaking" && mouthDriveRef.current ? mouthDriveRef.current() : null;
      if (drive) {
        rig.p.mouthOpen = clampS(0.05 + drive.open * 0.6, 0.04, 0.68);
        rig.p.mouthWidth = rig.p.mouthWidth * (0.92 + drive.tilt * 0.18);
      }
      const frame = computeScribbleFrame(rig.p, rig);
      lastFrameRef.current = frame;
      applyFrame(refs.current, frame);
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [ambientOn]);

  // The frame React renders with: the live one mid-animation, else the pose.
  // Under test this recomputes per render, so snapshots follow `emotion`.
  const renderFrame = useMemo(() => {
    if (!IN_TEST && lastFrameRef.current) return lastFrameRef.current;
    const p = { ...FACE_STATES[emotion] };
    if (gazeY != null) p.gazeY = gazeY;
    return computeScribbleFrame(p, restIdle(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emotion, gazeY]);

  const r = refs.current;
  return (
    <ScribbleCanvas className={className} style={style} strokeWidth={strokeWidth}>
      {(mainPass) => (
        <g
          ref={(el) => { r.root = el; }}
          transform={renderFrame.root.transform}
        >
          <path
            data-part="brow-left"
            ref={(el) => { r.browL = el; }}
            d={renderFrame.browL.d}
            transform={renderFrame.browL.transform}
          />
          <path
            data-part="brow-right"
            ref={(el) => { r.browR = el; }}
            d={renderFrame.browR.d}
            transform={renderFrame.browR.transform}
          />
          <EyeArt side="L" refs={refs} frame={renderFrame} />
          <EyeArt side="R" refs={refs} frame={renderFrame} />
          <path
            data-part="nose"
            ref={(el) => { r.nose = el; }}
            d={NOSE_D}
            transform={renderFrame.nose.transform || undefined}
          />
          <path
            data-part={mainPass ? "mouth" : undefined}
            ref={(el) => { r.mouth = el; }}
            d={renderFrame.mouth.d}
          />
        </g>
      )}
    </ScribbleCanvas>
  );
}
