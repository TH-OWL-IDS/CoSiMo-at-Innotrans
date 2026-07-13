"use client";

import { useId } from "react";

interface ScribbleCanvasProps {
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  /** Render the artwork. `mainPass` is always true (kept for API compat). */
  children: (mainPass: boolean) => React.ReactNode;
}

/**
 * Shared canvas for the scribble face: the padded viewBox (the artwork canvas
 * is 260×200; padding absorbs big poses, the brow strokes above the eyes and
 * filter displacement), ballpoint stroke defaults, and the turbulence filter
 * that wobbles clean geometry into pen strokes.
 */
export default function ScribbleCanvas({
  className,
  style,
  strokeWidth = 4.5,
  children,
}: ScribbleCanvasProps) {
  // useId may contain colons, which break url(#…) references.
  const filterId = `cosimo-scribble-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      viewBox="-16 -34 292 240"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.014"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
      {/* Single pass: the turbulence wobble alone carries the hand-drawn
          look. A second offset "overdraw" pass used to retrace the strokes,
          but WKWebView renders the displacement filter weakly enough that it
          read as a hard double image on the iPads — removed everywhere for a
          consistent, clean line. */}
      <g filter={`url(#${filterId})`}>{children(true)}</g>
    </svg>
  );
}
