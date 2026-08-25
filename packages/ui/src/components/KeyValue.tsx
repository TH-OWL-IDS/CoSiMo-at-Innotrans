import type { ReactNode } from "react";
import { cn } from "../cn";

/** Label · value rows with a fixed key column, for popups and detail panes. */
export function KeyValue({ rows, keyWidth = "w-24", className }: { rows: [string, ReactNode][]; keyWidth?: string; className?: string }) {
  return (
    <dl className={cn("m-0 flex flex-col gap-1.5 text-sm leading-snug", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2.5">
          <dt className={cn("shrink-0 text-mute", keyWidth)}>{k}</dt>
          <dd className="m-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
