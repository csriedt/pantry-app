import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// #region TYPES
interface EmptyStateProperties {
  headline: string;
  explanation?: string;
  mark?: ReactNode;
  action?: ReactNode;
  align?: "left" | "center";
}
// #endregion

export const EmptyState = (props: EmptyStateProperties) => {
  // #region CONSTANTS
  const { headline, explanation, mark, action, align = "left" } = props;
  // #endregion

  // #region VIEW
  return (
    <div
      className={cn(
        "flex flex-col gap-3 pt-5",
        align === "center" && "items-center text-center"
      )}
    >
      {mark}
      <h3 className="font-display text-[22px] leading-tight font-semibold">
        {headline}
      </h3>
      {explanation ? (
        <p className="m-0 max-w-[44ch] text-[14.5px] leading-normal text-muted-foreground">
          {explanation}
        </p>
      ) : null}
      {action}
    </div>
  );
  // #endregion
};
