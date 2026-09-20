import type { ReactNode } from "react";
import { cn } from "@cosimo/ui";

/**
 * The symbols on the seat panel, as line icons in the panel's own style
 * (rounded strokes, one weight): the talk button (a microphone — the panel
 * itself shows a speaker, the guides say microphone on purpose), the info
 * button (an i in a circle), the light button (sun) and the card reader
 * (a ring between two pairs of arcs, left and right). Used wherever the guides say
 * "press …" — visitors and staff see these on the panel, not key letters.
 */
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function TalkIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M9 21h6" />
    </svg>
  );
}

export function InfoIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="9.3" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" />
      <path d="M11.6 11.6h.6v4.6h.8" />
    </svg>
  );
}

export function LightIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  );
}

export function CardIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M8.4 8.6a4.8 4.8 0 0 0 0 6.8" />
      <path d="M5.6 5.8a8.8 8.8 0 0 0 0 12.4" />
      <path d="M15.6 8.6a4.8 4.8 0 0 1 0 6.8" />
      <path d="M18.4 5.8a8.8 8.8 0 0 1 0 12.4" />
    </svg>
  );
}

/** A panel button as the reader sees it: the icon in a rounded key, then its name. */
export function PanelKey({ icon, children, className }: { icon: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 align-middle", className)}>
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-well text-ink">{icon}</span>
      {children && <b>{children}</b>}
    </span>
  );
}
