import { cn } from "../cn";

/** A thin 0–100 bar; the fill width is data, so it stays inline. */
export function Meter({ pct, warn, className }: { pct: number; warn?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <span role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} className={cn("block h-1 rounded-xs bg-line", className)}>
      <span className={cn("block h-1 rounded-xs", warn ? "bg-warn" : "bg-ok")} style={{ width: `${v}%` }} />
    </span>
  );
}
