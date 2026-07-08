import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FaceEmotion } from "@cosimo/shared";

/**
 * Shared machinery for the scribble face (ported from CoSiMo-mockup): the
 * numeric-parameter tween, the entity prop contract, the ambient idle clock
 * and a Catmull-Rom path builder for organic strokes.
 */

/** Vitest sets VITEST in the env; entities snap instead of tweening there. */
export const IN_TEST = Boolean(
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.VITEST,
);

/** Props every scribble entity accepts. */
export interface ScribbleEntityProps {
  emotion: FaceEmotion;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  /** Morph duration in ms. Defaults to 350 (0 under test). */
  transitionMs?: number;
  /** Ambient idle motion (blinking, bobbing, breathing …). */
  idle?: boolean;
  /** Optional gaze override on the vertical axis (-1 up … 1 down). Lets a
   *  scene point the eyes somewhere (e.g. down at on-screen buttons). */
  gazeY?: number;
}

/**
 * Tween a flat record of numbers towards `target` with requestAnimationFrame
 * (ease-out cubic). Rebuilding geometry from plain numbers morphs reliably
 * everywhere — CSS transitions on path `d` do not.
 */
export function useTweenedParams<T extends { [K in keyof T]: number }>(
  target: T,
  durationMs: number,
): T {
  const [params, setParams] = useState(target);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (durationMs <= 0 || typeof requestAnimationFrame !== "function") {
      setParams(target);
      return;
    }
    const from = { ...paramsRef.current };
    const keys = Object.keys(target) as (keyof T)[];
    const start = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const k = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const next = {} as T;
      for (const key of keys) {
        next[key] = (from[key] +
          (target[key] - from[key]) * k) as T[keyof T];
      }
      setParams(next);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return params;
}

/**
 * Continuous clock for ambient idle motion, in seconds. The face modulates
 * its pose parameters from this — motion lives in the same parameter space as
 * the emotions, so it composes with morphs (a CSS keyframe could only wiggle
 * the whole group). Returns 0 while disabled, so all sin-based modulations
 * rest exactly at the pose.
 */
export function useAmbientClock(enabled: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!enabled || typeof requestAnimationFrame !== "function") {
      setT(0);
      return;
    }
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
  return t;
}

export type Pt = [number, number];

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Open Catmull-Rom spline through the points, as a cubic-bezier path. */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${r1(c1x)} ${r1(c1y)}, ${r1(c2x)} ${r1(c2y)}, ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}
