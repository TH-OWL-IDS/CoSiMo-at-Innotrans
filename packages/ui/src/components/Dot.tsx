import { cn } from "../cn";

export type DotState = "ok" | "warn" | "down";

/** A status dot: green / amber / red. Pair it with text — colour alone is not a signal. */
export function Dot({ state, size = "md", className }: { state: DotState; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "sm" ? "size-[7px]" : "size-[9px]",
        state === "ok" ? "bg-ok" : state === "warn" ? "bg-warn" : "bg-accent",
        className,
      )}
    />
  );
}
