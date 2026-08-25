import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

/** The small caps label above a block — the console's section heading. */
const eyebrow = cva("m-0 flex items-center gap-1.5 uppercase tracking-caps", {
  variants: {
    size: {
      sm: "text-sm opacity-55",
      xs: "text-xs text-mute",
      "2xs": "text-2xs text-mute",
    },
  },
  defaultVariants: { size: "sm" },
});

export function Eyebrow({ className, size, ...props }: HTMLAttributes<HTMLParagraphElement> & VariantProps<typeof eyebrow>) {
  return <p className={cn(eyebrow({ size }), className)} {...props} />;
}
