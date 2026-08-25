import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

/**
 * The one button. Variants are the few looks the console actually has:
 * `default` (white, hairline) · `secondary` (sunken) · `primary` (ink) ·
 * `on` (green — a toggle that is switched on) · `ghost` (menu rows) ·
 * `outline` (the softer hairline the diagram uses).
 */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono",
    "border cursor-pointer select-none focus-ring",
    "transition-[background-color,border-color,opacity] duration-150 motion-reduce:transition-none",
    "disabled:opacity-45 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        default: "bg-white text-ink border-line-strong hover:bg-well active:bg-line-soft",
        secondary: "bg-well text-ink border-line-strong hover:bg-line-soft active:bg-line",
        primary: "bg-ink text-white border-ink hover:opacity-90 active:opacity-80",
        on: "bg-ok text-white border-ok",
        ghost: "bg-transparent text-mute border-transparent hover:bg-well hover:text-ink",
        outline: "bg-white text-mute border-line hover:bg-well hover:text-ink",
      },
      size: {
        xs: "text-xs px-2 py-0.5 rounded-md",
        sm: "text-sm px-2.5 py-1.5 rounded-lg",
        md: "text-base px-3.5 py-2 rounded-lg",
        lg: "text-base px-3.5 py-2.5 rounded-lg w-full",
      },
      icon: {
        true: "p-1.5 aspect-square",
      },
      tone: {
        accent: "text-accent",
        warn: "border-warn",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, icon, tone, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, icon, tone }), className)} {...props} />;
});
