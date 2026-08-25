import logoUrl from "../assets/monocab-logo.svg";

/**
 * The wordmark: CoSiMo × MonoCab logo. The "CoSiMo" and the "×" are set
 * in Schoolbell — hand-written, like the scribble face — against the
 * monospace of everything else. `size` is the logo's edge in px; the type
 * scales with it through `em`. Shared by every browser app's header.
 */
export function Brand({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-[0.3em] font-wordmark leading-none" style={{ fontSize: size }}>
      <span className="text-[0.72em] tracking-[0.5px] text-ink">CoSiMo</span>
      <span aria-hidden className="translate-y-px text-[0.55em] text-mute">×</span>
      <img src={logoUrl} alt="MonoCab" width={size} height={size} className="block" />
    </span>
  );
}
