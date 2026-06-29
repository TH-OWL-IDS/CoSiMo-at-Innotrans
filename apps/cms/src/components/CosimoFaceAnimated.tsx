"use client";

import { FACE_STATES, type FaceParams } from "../face/states";
import {
  IN_TEST,
  useTweenedParams,
  type ScribbleEntityProps,
} from "../face/shared";
import ScribbleCanvas from "./ScribbleCanvas";

/**
 * The CoSiMo face, animatable between expressions (ported from CoSiMo-mockup).
 * Geometry is traced from the original scribble artwork; morphing tweens the
 * numeric FaceParams and rebuilds geometry each frame. The scribble look comes
 * from ScribbleCanvas (turbulence wobble + pen overdraw).
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* Layout constants, traced from the artwork (mapped onto the 260×200 canvas). */
const EYE_L = { x: 48, y: 31 };
const EYE_R = { x: 202, y: 33 };
const MOUTH_CX = 104;

interface EyeProps {
  p: FaceParams;
  side: "L" | "R";
}

function ScribbleEye({ p, side }: EyeProps) {
  const { x, y } = side === "L" ? EYE_L : EYE_R;
  const open = side === "L" ? p.eyeOpenL : p.eyeOpenR;
  const lift = side === "L" ? p.browLiftL : p.browLiftR;
  const slant = side === "L" ? p.browSlantL : p.browSlantR;
  const rot = (side === "L" ? -slant : slant) * 0.8;

  const sx = 1 + p.eyeRound * 0.3;
  const sy = sx * Math.max(0.5, open);
  const nestVis = clamp01((open - 0.2) / 0.25);

  const lidY = y + 3;
  const lidPath =
    `M${x - 15} ${lidY} Q${x} ${lidY - p.lidCurve * 20} ${x + 15} ${lidY}`;

  return (
    <g transform={`translate(0 ${-lift * 0.6}) rotate(${rot} ${x} ${y})`}>
      {side === "L" ? (
        <path d={`M${x - 16} ${y - 10} L${x - 22.5} ${y - 15.5}`} />
      ) : (
        <path d={`M${x + 14} ${y - 9.5} L${x + 20.5} ${y - 14.5}`} />
      )}
      {nestVis > 0.01 && (
        <g
          opacity={nestVis}
          transform={`translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})`}
        >
          {side === "L" ? (
            <>
              <ellipse cx={x} cy={y} rx={17} ry={19} transform={`rotate(-8 ${x} ${y})`} />
              <ellipse cx={x + 2} cy={y - 2} rx={11} ry={12.5} transform={`rotate(10 ${x} ${y})`} />
              <ellipse cx={x + 1} cy={y + 2} rx={5.5} ry={7} />
            </>
          ) : (
            <>
              <ellipse cx={x} cy={y} rx={16} ry={17} transform={`rotate(12 ${x} ${y})`} />
              <ellipse cx={x - 8} cy={y - 6} rx={10} ry={11} transform={`rotate(-15 ${x} ${y})`} />
            </>
          )}
          <g transform={`translate(${p.gazeX * 5} ${p.gazeY * 4})`}>
            {side === "L" ? (
              <>
                <circle cx={x - 3} cy={y + 14} r={6} fill="currentColor" stroke="none" />
                <ellipse cx={x - 2} cy={y + 14} rx={8} ry={6.5} />
              </>
            ) : (
              <>
                <circle cx={x - 1} cy={y + 5} r={6.5} fill="currentColor" stroke="none" />
                <ellipse cx={x - 1} cy={y + 6} rx={8.5} ry={7.5} />
              </>
            )}
          </g>
        </g>
      )}
      {nestVis < 0.99 && <path opacity={1 - nestVis} d={lidPath} />}
    </g>
  );
}

function mouthPath(p: FaceParams) {
  const w = p.mouthWidth * 1.3;
  const c = p.mouthCurve;
  const lx = MOUTH_CX - w;
  const rx = MOUTH_CX + w;
  const tf = 1 - p.mouthOpen;
  const ly = p.mouthY - 0.45 * c * tf;
  const ry = p.mouthY + 0.35 * c * tf;
  const c1x = MOUTH_CX - 0.9 * p.mouthWidth;
  const c2x = MOUTH_CX + 0.5 * p.mouthWidth;
  const c1y = p.mouthY + 0.85 * c;
  const c2y = p.mouthY + 0.6 * c;
  const o = p.mouthOpen * 55;
  return (
    `M${lx} ${ly} C${c1x} ${c1y}, ${c2x} ${c2y}, ${rx} ${ry}` +
    ` C${c2x} ${c2y + o}, ${c1x} ${c1y + o}, ${lx} ${ly}`
  );
}

const NOSE_D =
  "M143 72" +
  " C146.5 86, 152.5 101, 155.5 114" +
  " C157 121, 156.5 126.5, 153.5 129" +
  " C149.5 131.5, 139 130.8, 129.5 129.5";

function FaceStrokes({
  p,
  blinking,
  talking,
  mainPass,
}: {
  p: FaceParams;
  blinking: boolean;
  talking: boolean;
  mainPass: boolean;
}) {
  return (
    <>
      <g className={blinking ? "cosimo-blink" : undefined}>
        <ScribbleEye p={p} side="L" />
        <ScribbleEye p={p} side="R" />
      </g>
      <path d={NOSE_D} />
      <path
        data-part={mainPass ? "mouth" : undefined}
        className={talking ? "cosimo-talk" : undefined}
        d={mouthPath(p)}
      />
    </>
  );
}

export default function CosimoFaceAnimated({
  emotion,
  className,
  strokeWidth = 4.5,
  style,
  transitionMs,
  idle = true,
}: ScribbleEntityProps) {
  const duration = transitionMs ?? (IN_TEST ? 0 : 350);
  const p = useTweenedParams(FACE_STATES[emotion], duration);

  const ambient = idle && !IN_TEST;
  const target = FACE_STATES[emotion];
  const blinking =
    ambient &&
    emotion !== "surprised" &&
    target.eyeOpenL > 0.5 &&
    target.eyeOpenR > 0.5;
  const talking = ambient && emotion === "speaking";

  return (
    <ScribbleCanvas className={className} style={style} strokeWidth={strokeWidth}>
      {(mainPass) => (
        <g transform={`rotate(${p.tilt} 130 110)`}>
          <FaceStrokes
            p={p}
            blinking={blinking}
            talking={talking}
            mainPass={mainPass}
          />
        </g>
      )}
    </ScribbleCanvas>
  );
}
