import type { ReactNode } from "react";
import { cn } from "../cn";
import { Truncated } from "./Tip";

/**
 * Label · value rows with a fixed key column, for cards, popups and detail
 * panes. Every row is one line: a long string value is cut with an ellipsis
 * and, only then, carries a tooltip with the full text (see `Truncated`).
 */
export function KeyValue({ rows, keyWidth = "w-24", className }: { rows: [string, ReactNode][]; keyWidth?: string; className?: string }) {
  return (
    <dl className={cn("m-0 flex flex-col gap-1.5 text-sm leading-snug", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 gap-2.5">
          <dt className={cn("shrink-0 truncate text-mute", keyWidth)}>{k}</dt>
          <dd className="m-0 min-w-0 flex-1 text-ink">
            {typeof v === "string" ? <Truncated text={v} /> : <span className="block truncate">{v}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
