import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * Label · value rows with a fixed key column, for cards, popups and detail
 * panes. Every row is one line: a long value is cut with an ellipsis and
 * shown in full as a tooltip (string values; a node passes its own title).
 */
export function KeyValue({ rows, keyWidth = "w-24", className }: { rows: [string, ReactNode][]; keyWidth?: string; className?: string }) {
  return (
    <dl className={cn("m-0 flex flex-col gap-1.5 text-sm leading-snug", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 gap-2.5">
          <dt className={cn("shrink-0 truncate text-mute", keyWidth)} title={k}>{k}</dt>
          <dd className="m-0 min-w-0 flex-1 truncate text-ink" title={typeof v === "string" ? v : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
