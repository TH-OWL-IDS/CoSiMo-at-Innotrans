import { cn } from "../cn";

/** One seat in the cab: red = live CoSiMo seat, ink = simulated rider, hollow = free. */
export function SeatGlyph({ state, title }: { state: "live" | "taken" | "free"; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-block h-[17px] w-[13px] rounded-[4px_4px_2px_2px] border border-ink",
        state === "live" ? "bg-accent" : state === "taken" ? "bg-ink" : "bg-transparent opacity-30",
      )}
    />
  );
}
