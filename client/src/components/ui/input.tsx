import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded border border-[hsl(180,50%,20%)] bg-[hsl(240,25%,6%)] px-3 py-2 text-base text-[hsl(180,100%,90%)] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[hsl(180,30%,40%)] transition-all duration-300 focus-visible:outline-none focus-visible:border-[hsl(180,100%,50%)] focus-visible:shadow-[0_0_10px_rgba(0,255,255,0.3),inset_0_0_10px_rgba(0,255,255,0.05)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm font-[Rajdhani,sans-serif]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
