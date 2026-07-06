import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-semibold uppercase tracking-wider ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 font-[Rajdhani,sans-serif]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_15px_hsl(180,100%,50%),0_0_30px_hsl(180,100%,50%)] border border-primary/50",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_0_15px_hsl(350,100%,55%)] border border-destructive/50",
        outline:
          "border border-[hsl(180,50%,30%)] bg-transparent text-[hsl(180,100%,70%)] hover:border-[hsl(180,100%,50%)] hover:text-[hsl(180,100%,90%)] hover:shadow-[0_0_10px_hsl(180,100%,50%),inset_0_0_10px_rgba(0,255,255,0.1)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-[0_0_15px_hsl(320,100%,60%)] border border-secondary/50",
        ghost: "hover:bg-[hsl(180,100%,50%)]/10 hover:text-[hsl(180,100%,70%)] hover:shadow-[inset_0_0_10px_rgba(0,255,255,0.1)]",
        link: "text-primary underline-offset-4 hover:underline hover:text-[hsl(180,100%,70%)]",
        cyber: "bg-transparent border-2 border-[hsl(180,100%,50%)] text-[hsl(180,100%,50%)] hover:bg-[hsl(180,100%,50%)] hover:text-[hsl(240,20%,4%)] hover:shadow-[0_0_20px_hsl(180,100%,50%),0_0_40px_hsl(180,100%,50%)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded px-3",
        lg: "h-11 rounded px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
