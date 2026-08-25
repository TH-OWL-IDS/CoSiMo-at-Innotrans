import { cn } from "../cn";

export type DotState = "ok" | "warn" | "down" | "starting";

/** A status dot: green / amber / red, grey while starting. Pair it with text — colour alone is not a signal. */
export function Dot({ state, size = "md", className }: { state: DotState; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "sm" ? "size-[7px]" : "size-[9px]",
        state === "ok" ? "bg-ok" : state === "warn" ? "bg-warn" : state === "starting" ? "bg-mute" : "bg-accent",
        className,
      )}
    />
  );
}
