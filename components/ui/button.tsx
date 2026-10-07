import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-control border whitespace-nowrap transition-all outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-ink bg-ink font-semibold text-canvas hover:bg-ink/90 active:translate-y-px",
        secondary:
          "border-strong bg-transparent font-medium text-ink hover:bg-chip active:translate-y-px",
        chef: "border-herb bg-herb font-semibold text-herb-on hover:bg-herb/90 active:translate-y-px",
        commit:
          "border-rust bg-rust font-semibold text-rust-on hover:bg-rust/90 active:translate-y-px",
        ghost:
          "border-transparent font-medium text-ink hover:bg-chip active:translate-y-px",
        destructive:
          "border-danger bg-danger font-semibold text-danger-on hover:bg-danger/90 active:translate-y-px",
        link: "border-transparent font-medium text-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 gap-2 px-5 text-[15px]",
        sm: "h-11 gap-1.5 px-4 text-sm",
        xs: "h-8 gap-1 rounded-[10px] px-3 text-xs",
        lg: "h-12 gap-2 px-6 text-[15px]",
        icon: "size-12",
        "icon-sm": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
