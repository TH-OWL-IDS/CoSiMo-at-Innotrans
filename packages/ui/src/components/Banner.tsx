import type { HTMLAttributes } from "react";
import { cn } from "../cn";

/** An inline notice. Only a warn tone exists so far — add tones as they are needed. */
export function Banner({ className, tone = "warn", ...props }: HTMLAttributes<HTMLDivElement> & { tone?: "warn" }) {
  return (
    <div
      role="status"
      className={cn(
        "inline-flex items-center gap-3 rounded-lg border px-3.5 py-2 text-base",
        tone === "warn" && "border-warn bg-warn-soft text-warn",
        className,
      )}
      {...props}
    />
  );
}
