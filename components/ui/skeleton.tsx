import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-skeleton rounded-[6px] bg-skeleton", className)}
      {...props}
    />
  )
}

export { Skeleton }
