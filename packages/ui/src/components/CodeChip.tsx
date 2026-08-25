import type { HTMLAttributes } from "react";
import { cn } from "../cn";

/** A line of machine text — a tool call, a result, an error. */
export function CodeChip({ className, tone = "default", ...props }: HTMLAttributes<HTMLElement> & { tone?: "default" | "error" }) {
  return (
    <code
      className={cn(
        "block whitespace-pre-wrap break-words rounded-sm bg-well px-1.5 py-[3px] text-xs",
        tone === "error" ? "text-accent border-l-2 border-accent" : "opacity-85 border-l-2 border-line",
        className,
      )}
      {...props}
    />
  );
}
