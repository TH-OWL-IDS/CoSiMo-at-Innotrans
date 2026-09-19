"use client";

interface ScribbleCanvasProps {
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  /** Render the artwork. `mainPass` is always true (kept for API compat). */
  children: (mainPass: boolean) => React.ReactNode;
}

/**
 * Shared canvas for the scribble face: the padded viewBox (the artwork canvas
 * is 260×200; padding absorbs big poses and the brow strokes above the eyes)
 * and the ballpoint stroke defaults. The hand-drawn wobble is in the
 * geometry (`wobble.ts`), not a filter — see there for why.
 */
export default function ScribbleCanvas({
  className,
  style,
  strokeWidth = 4.5,
  children,
}: ScribbleCanvasProps) {
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
      <g>{children(true)}</g>
    </svg>
  );
}
