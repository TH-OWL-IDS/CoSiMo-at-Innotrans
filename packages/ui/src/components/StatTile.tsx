import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../cn";
import { Eyebrow } from "./Eyebrow";

/** A labelled number: eyebrow with icon, the value, an optional sub line. */
export function StatTile({ label, value, sub, warn, icon: Icon, className }: {
  label: string;
  value: string;
  sub?: ReactNode;
  warn?: boolean;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-white px-3.5 py-2.5", className)}>
      <Eyebrow size="xs">
        <Icon size={13} />
        {label}
      </Eyebrow>
      <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums", warn ? "text-warn" : "text-ink")}>{value}</div>
      {sub ? <div className="mt-0.5 text-sm text-mute">{sub}</div> : null}
    </div>
  );
}
