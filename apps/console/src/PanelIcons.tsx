import type { ReactNode } from "react";
import { cn } from "@cosimo/ui";

/**
 * The symbols on the seat panel, as line icons in the panel's own style
 * (rounded strokes, one weight): the talk button (microphone), the info
 * button (CoSiMo's face in an oval), the light button (sun) and the card
 * reader (a ring between two pairs of arcs). Used wherever the guides say
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
      <ellipse cx="12" cy="12" rx="9.5" ry="8.2" />
      <circle cx="8.3" cy="12.6" r="0.5" fill="currentColor" />
      <path d="M11.3 13.6c0-1.5.8-2.2 2.2-2.2h2.3" />
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
      <path d="M8.6 8.4a4.8 4.8 0 0 1 6.8 0" />
      <path d="M5.8 5.6a8.8 8.8 0 0 1 12.4 0" />
      <path d="M8.6 15.6a4.8 4.8 0 0 0 6.8 0" />
      <path d="M5.8 18.4a8.8 8.8 0 0 0 12.4 0" />
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
