import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

/** A pill. Static by default; `<ChipButton>` is the toggle flavour. */
const chip = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-mono", {
  variants: {
    size: {
      xs: "text-xs px-2 py-0.5",
      sm: "text-sm px-3 py-1",
      md: "text-sm px-3 py-2",
    },
    active: {
      true: "border-accent",
      false: "border-line",
    },
    muted: {
      true: "opacity-55",
    },
  },
  defaultVariants: { size: "xs", active: false },
});

type ChipVariants = VariantProps<typeof chip>;

export function Chip({ className, size, active, muted, ...props }: HTMLAttributes<HTMLSpanElement> & ChipVariants) {
  return <span className={cn(chip({ size, active, muted }), className)} {...props} />;
}

/** A pressable chip: `aria-pressed` drives the look (off = dimmed). */
export const ChipButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & ChipVariants>(
  function ChipButton({ className, size, active, muted, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          chip({ size, active, muted }),
          "cursor-pointer bg-well focus-ring transition-[opacity,border-color] duration-150 motion-reduce:transition-none",
          "aria-[pressed=true]:border-line-strong aria-[pressed=false]:opacity-35 hover:opacity-100",
          className,
        )}
        {...props}
      />
    );
  },
);
