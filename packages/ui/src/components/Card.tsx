import type { HTMLAttributes } from "react";
import { cn } from "../cn";

/** A white surface with a hairline; `active` lifts the border to accent. */
export function Card({ className, active, ...props }: HTMLAttributes<HTMLElement> & { active?: boolean }) {
  return (
    <section
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border bg-white p-4 shadow-card",
        active ? "border-accent" : "border-line",
        className,
      )}
      {...props}
    />
  );
}
