import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

/**
 * Inputs and selects share one look. `tone="well"` is the sunken flavour
 * the log toolbar uses. Selects stay native on purpose — the iOS picker is
 * the right touch UX; give them an `aria-label` or a <label>.
 */
const field = cva(
  [
    "font-mono text-ink border focus-ring",
    "transition-[border-color,opacity] duration-150 motion-reduce:transition-none",
    "aria-[invalid=true]:border-accent",
    "disabled:opacity-45",
  ],
  {
    variants: {
      size: {
        sm: "text-sm px-2 py-1.5 rounded-md",
        md: "text-md px-2.5 py-1.5 rounded-lg",
        lg: "text-xl px-3 py-2.5 rounded-lg",
      },
      tone: {
        surface: "bg-white border-line-strong",
        well: "bg-well border-line",
      },
    },
    defaultVariants: { size: "md", tone: "surface" },
  },
);

type FieldVariants = VariantProps<typeof field>;

export const Input = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & FieldVariants>(
  function Input({ className, size, tone, ...props }, ref) {
    return <input ref={ref} className={cn(field({ size, tone }), className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & FieldVariants>(
  function Select({ className, size, tone, ...props }, ref) {
    return <select ref={ref} className={cn(field({ size, tone }), "cursor-pointer", className)} {...props} />;
  },
);
