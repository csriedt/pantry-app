import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-pill border whitespace-nowrap transition-all outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-invalid:border-danger [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "h-8 border-strong bg-surface px-2.5 text-[12.5px] font-medium text-ink",
        tap: "h-11 border-strong bg-surface px-3.5 text-sm font-medium text-ink",
        secondary:
          "h-8 border-transparent bg-chip px-2.5 text-[12.5px] font-medium text-ink",
        outline:
          "h-8 border-strong bg-transparent px-2.5 text-[12.5px] font-medium text-ink",
        short:
          "h-6 border-[color-mix(in_oklab,var(--amber)_50%,var(--surface))] bg-[color-mix(in_oklab,var(--amber)_12%,var(--surface))] px-2 font-mono text-[10px] tracking-micro text-ink uppercase",
        out: "h-6 border-strong bg-transparent px-2 font-mono text-[10px] tracking-micro text-ink uppercase",
        destructive:
          "h-8 border-danger/40 bg-danger/10 px-2.5 text-[12.5px] font-medium text-danger",
        ghost:
          "h-8 border-transparent px-2.5 text-[12.5px] font-medium text-ink hover:bg-chip",
        link: "border-transparent px-0 text-[12.5px] font-medium text-ink underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
