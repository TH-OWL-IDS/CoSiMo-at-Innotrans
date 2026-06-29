"use client";

import { useId } from "react";

interface ScribbleCanvasProps {
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  /** Render the artwork; called twice (main pass and faint overdraw pass). */
  children: (mainPass: boolean) => React.ReactNode;
}

/**
 * Shared canvas for the scribble face (ported from CoSiMo-mockup): the padded
 * viewBox, ballpoint stroke defaults, the turbulence filter that wobbles clean
 * geometry into pen strokes, and the slightly offset second pass that imitates
 * casual pen overdraw.
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
      viewBox="-16 -24 292 240"
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
      <g filter={`url(#${filterId})`}>
        <g>{children(true)}</g>
        {/* overdraw pass — a faint, slightly offset retrace of every stroke */}
        <g
          transform="translate(1.6 -1) rotate(-0.7 130 110)"
          opacity={0.25}
          strokeWidth={strokeWidth * 0.6}
        >
          {children(false)}
        </g>
      </g>
    </svg>
  );
}
