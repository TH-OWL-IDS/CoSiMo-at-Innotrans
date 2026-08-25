import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

/**
 * A tooltip that works where native `title` doesn't: instant on hover,
 * and on touch a tap (focus) opens it — the console lives on iPads. Pure
 * CSS (`.tip::after` reads `data-tip`), multi-line via newlines in `tip`.
 * The element must not clip overflow itself; wrap the truncated text.
 */
export function Tip({ tip, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tip?: string | null; children: ReactNode }) {
  return (
    <span
      tabIndex={tip ? 0 : undefined}
      data-tip={tip || undefined}
      className={cn(tip && "tip", className)}
      {...rest}
    >
      {children}
    </span>
  );
}

/**
 * One line of text, cut with an ellipsis when it overflows — and only then
 * carrying a tooltip with the full text (measured, re-measured on resize).
 */
export function Truncated({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <Tip tip={cut ? text : null} className={cn("block min-w-0", className)}>
      <span ref={ref} className="block truncate">{text}</span>
    </Tip>
  );
}
