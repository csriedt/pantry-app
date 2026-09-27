"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useModals } from "@/components/app/modal-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useListCampaigns } from "@/hooks/campaigns/useListCampaigns";
import type { CampaignState } from "@/types/campaigns/campaignState";

// #region HELPERS
function stateVariant(
  state: CampaignState | null
): "success" | "warning" | "coral" | "neutral" {
  switch (state) {
    case "active":
      return "success";
    case "paused":
      return "warning";
    case "done":
      return "coral";
    default:
      return "neutral";
  }
}

function stateLabel(state: CampaignState | null): string {
  if (!state) return "Draft";
  return state.charAt(0).toUpperCase() + state.slice(1);
}
// #endregion

export default function CampaignsPage() {
  // #region HOOKS
  const router = useRouter();
  const { openAddCampaign } = useModals();
  const [query, action] = useListCampaigns();
  // #endregion

  // #region DATA
  React.useEffect(() => {
    action({ params: { page: 1, pageSize: 50 } });
  }, [action]);

  const campaigns = query.data?.data?.items ?? [];
  // #endregion

  // #region VIEW
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-7">
      <PageHeader
        title="Campaigns"
        subtitle="Every campaign connects to a way for customers to reach you."
        action={
          <Button
            variant="primary"
            onClick={() =>
              openAddCampaign(() =>
                action({ params: { page: 1, pageSize: 50 } })
              )
            }>
            <Plus aria-hidden="true" />
            New campaign
          </Button>
        }
      />

      {query.isLoading && (
        <div className="text-text-tertiary py-10 text-center text-sm">
          Loading campaigns…
        </div>
      )}

      {query.isError && (
        <div className="text-error py-10 text-center text-sm">
          Failed to load campaigns.
        </div>
      )}

      {query.isSuccess && campaigns.length === 0 && (
        <div className="border-border bg-surface text-text-tertiary rounded-lg border px-6 py-10 text-center text-sm shadow-sm">
          No campaigns yet — create your first one.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {campaigns.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => router.push(`/campaigns/${c.id}`)}
            className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-5 text-left shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <h3 className="dark:text-foreground text-[17px] font-semibold text-neutral-900">
                {c.name}
              </h3>
              <Badge variant={stateVariant(c.state)} dot size="sm">
                {stateLabel(c.state)}
              </Badge>
            </div>
            {c.description && (
              <p className="text-text-secondary text-sm leading-relaxed">
                {c.description}
              </p>
            )}
            {c.goal && (
              <span className="dark:text-text-secondary inline-flex h-6 items-center self-start rounded-md bg-neutral-100 px-2.5 text-[11px] font-semibold text-neutral-600 dark:bg-white/10">
                {c.goal}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
  // #endregion
}
