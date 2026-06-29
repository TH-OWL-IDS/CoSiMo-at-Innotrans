"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FaceEmotion } from "@cosimo/shared";

/**
 * Shared machinery for the scribble face, ported from CoSiMo-mockup: the
 * numeric-parameter tween and the common entity prop contract. Rebuilding
 * geometry from plain numbers morphs reliably everywhere — CSS transitions on
 * path `d` do not.
 */

/** Vitest sets VITEST in the env; entities snap instead of tweening there. */
export const IN_TEST = Boolean(
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.VITEST,
);

export interface ScribbleEntityProps {
  emotion: FaceEmotion;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  /** Morph duration in ms. Defaults to 350 (0 under test). */
  transitionMs?: number;
  /** Ambient idle motion (blinking, bobbing, breathing …). */
  idle?: boolean;
}

/**
 * Tween a flat record of numbers towards `target` with requestAnimationFrame
 * (ease-out cubic).
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
        next[key] = (from[key] + (target[key] - from[key]) * k) as T[keyof T];
      }
      setParams(next);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return params;
}
