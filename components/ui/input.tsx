import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-control border border-strong bg-surface px-3.5 py-2 text-[15px] text-ink transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-50 aria-invalid:border-danger aria-invalid:shadow-[0_0_0_4px_color-mix(in_oklab,var(--danger)_25%,transparent)] focus-visible:border-ink focus-visible:shadow-[0_0_0_2px_var(--canvas),0_0_0_4px_color-mix(in_oklab,var(--ink)_40%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
