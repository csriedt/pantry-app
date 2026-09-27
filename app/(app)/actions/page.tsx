"use client";

import { Check } from "lucide-react";
import * as React from "react";

import { ListPagination } from "@/components/patterns/list-pagination";
import { PageHeader } from "@/components/patterns/page-header";
import { SuggestCard } from "@/components/patterns/suggest-card";
import { TabStrip } from "@/components/patterns/tab-strip";
import { useApproveAction } from "@/hooks/actions/useApproveAction";
import { useDeleteAction } from "@/hooks/actions/useDeleteAction";
import { useDismissAction } from "@/hooks/actions/useDismissAction";
import { useEditAction } from "@/hooks/actions/useEditAction";
import { useListActions } from "@/hooks/actions/useListActions";
import { useRegenerateAction } from "@/hooks/actions/useRegenerateAction";
import {
  extractDraft,
  payloadStr,
  toCardProps,
} from "@/lib/actions/actionDisplay";
import type { Action } from "@/types/actions/action";

const PAGE_SIZE = 50;

export default function ActionsPage() {
  // #region STATE
  const [tab, setTab] = React.useState<"pending" | "completed">("pending");
  const [pendingPage, setPendingPage] = React.useState(1);
  const [completedPage, setCompletedPage] = React.useState(1);
  // #endregion

  // #region HOOKS
  const [pendingQuery, fetchPending] = useListActions();
  // Completed is fetched eagerly (for the tab count) even while the user
  // is still on Pending, so a transient error here is background noise —
  // suppress the toast and rely on the Completed tab's inline error state.
  const [completedQuery, fetchCompleted] = useListActions({ error: false });
  const [, approveActionAsync] = useApproveAction();
  const [, dismissActionAsync] = useDismissAction();
  const [, deleteActionAsync] = useDeleteAction();
  const [, editActionAsync] = useEditAction();
  const [, regenerateActionAsync] = useRegenerateAction();
  // #endregion

  // #region DATA
  const pendingData = pendingQuery.data?.data;
  const completedData = completedQuery.data?.data;

  const pendingTotal = pendingData?.total ?? 0;
  const pendingTotalPages = Math.max(1, Math.ceil(pendingTotal / PAGE_SIZE));
  // `pendingPage`/`completedPage` can end up past their totalPages if the
  // list shrinks (e.g. approving the last action on the last page) —
  // clamp what's fetched/rendered rather than looping a setState back
  // through an effect.
  const pendingCurrentPage = Math.min(pendingPage, pendingTotalPages);

  const completedTotal = completedData?.total ?? 0;
  const completedTotalPages = Math.max(
    1,
    Math.ceil(completedTotal / PAGE_SIZE)
  );
  const completedCurrentPage = Math.min(completedPage, completedTotalPages);

  const today = new Date().toISOString().slice(0, 10);
  const pendingItems = pendingData?.items ?? [];
  const overdueItems = pendingItems.filter(
    a => a.due_date !== null && a.due_date < today
  );
  const dueTodayItems = pendingItems.filter(a => a.due_date === today);
  const upcomingItems = pendingItems.filter(
    a => a.due_date === null || a.due_date > today
  );
  const completedItems = completedData?.items ?? [];
  // #endregion

  // #region EFFECTS
  React.useEffect(() => {
    fetchPending({
      params: {
        status: "pending",
        page: pendingCurrentPage,
        pageSize: PAGE_SIZE,
      },
    });
  }, [fetchPending, pendingCurrentPage]);

  React.useEffect(() => {
    fetchCompleted({
      params: {
        status: "completed",
        page: completedCurrentPage,
        pageSize: PAGE_SIZE,
      },
    });
  }, [fetchCompleted, completedCurrentPage]);
  // #endregion

  // #region HANDLERS
  const handleApprove = React.useCallback(
    (actionId: string) => () => approveActionAsync({ actionId }),
    [approveActionAsync]
  );

  const handleDismiss = React.useCallback(
    (actionId: string) => () => dismissActionAsync({ actionId }),
    [dismissActionAsync]
  );

  const handleDelete = React.useCallback(
    (actionId: string) => () => deleteActionAsync({ actionId }),
    [deleteActionAsync]
  );

  const handleSaveDraft = React.useCallback(
    (action: Action) => (draft: string) => {
      const base =
        action.proposed_payload !== null &&
        typeof action.proposed_payload === "object" &&
        !Array.isArray(action.proposed_payload)
          ? (action.proposed_payload as Record<string, unknown>)
          : {};
      return editActionAsync({
        actionId: action.id,
        patch: { proposed_payload: { ...base, body: draft } },
      });
    },
    [editActionAsync]
  );

  const handleRegenerate = React.useCallback(
    (actionId: string) => (instruction: string) =>
      regenerateActionAsync({ actionId, instruction }),
    [regenerateActionAsync]
  );
  // #endregion

  // #region HELPERS — tabs
  // True count of all pending/completed actions (from the paged
  // response's `total`), not just the rows on the current page.
  const pendingCount = pendingData?.total ?? 0;
  const completedCount = completedData?.total ?? 0;

  // Memoised so the strip only re-renders when a count actually moves, not on
  // every render of this page.
  const tabs = React.useMemo(
    () => [
      { value: "pending", label: "Pending", count: pendingCount },
      { value: "completed", label: "Completed", count: completedCount },
    ],
    [pendingCount, completedCount]
  );
  // #endregion

  // #region VIEW
  const isPendingLoading =
    pendingQuery.isLoading || pendingQuery.data === undefined;
  const isCompletedLoading =
    tab === "completed" &&
    (completedQuery.isLoading || completedQuery.data === undefined);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-7">
      <PageHeader
        title="Actions"
        subtitle="Everything PreviousApp has teed up for you. Edit a draft, then mark it done."
      />

      <TabStrip
        items={tabs}
        value={tab}
        onValueChange={v => setTab(v as "pending" | "completed")}
        className="mb-5"
      />

      {tab === "pending" ? (
        isPendingLoading ? (
          <div className="text-text-tertiary py-12 text-center text-sm">
            Loading actions…
          </div>
        ) : pendingQuery.isError ? (
          <div className="text-error py-12 text-center text-sm">
            Failed to load pending actions.
          </div>
        ) : pendingItems.length === 0 ? (
          <div className="text-text-tertiary py-12 text-center text-sm">
            No pending actions.
          </div>
        ) : (
          <>
            {overdueItems.length > 0 && (
              <>
                <div className="text-error mb-2.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Overdue · {overdueItems.length}
                </div>
                <div className="mb-6 flex flex-col gap-3">
                  {overdueItems.map(a => {
                    const props = toCardProps(a);
                    return (
                      <SuggestCard
                        key={a.id}
                        {...props}
                        onApprove={handleApprove(a.id)}
                        onDismiss={handleDismiss(a.id)}
                        onDelete={handleDelete(a.id)}
                        onSaveDraft={handleSaveDraft(a)}
                        onRegenerate={handleRegenerate(a.id)}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {dueTodayItems.length > 0 && (
              <>
                <div className="text-text-tertiary mb-2.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Due today · {dueTodayItems.length}
                </div>
                <div className="mb-6 flex flex-col gap-3">
                  {dueTodayItems.map(a => {
                    const props = toCardProps(a);
                    return (
                      <SuggestCard
                        key={a.id}
                        {...props}
                        onApprove={handleApprove(a.id)}
                        onDismiss={handleDismiss(a.id)}
                        onDelete={handleDelete(a.id)}
                        onSaveDraft={handleSaveDraft(a)}
                        onRegenerate={handleRegenerate(a.id)}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {upcomingItems.length > 0 && (
              <>
                <div className="text-text-tertiary mb-2.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Upcoming · {upcomingItems.length}
                </div>
                <div className="flex flex-col gap-3">
                  {upcomingItems.map(a => {
                    const props = toCardProps(a);
                    return (
                      <SuggestCard
                        key={a.id}
                        {...props}
                        onApprove={handleApprove(a.id)}
                        onDismiss={handleDismiss(a.id)}
                        onDelete={handleDelete(a.id)}
                        onSaveDraft={handleSaveDraft(a)}
                        onRegenerate={handleRegenerate(a.id)}
                      />
                    );
                  })}
                </div>
              </>
            )}

            <ListPagination
              currentPage={pendingCurrentPage}
              totalPages={pendingTotalPages}
              total={pendingTotal}
              itemLabel="action"
              onPageChange={setPendingPage}
            />
          </>
        )
      ) : completedQuery.isError ? (
        <div className="text-text-tertiary py-12 text-center text-sm">
          Failed to load actions.
        </div>
      ) : isCompletedLoading ? (
        <div className="text-text-tertiary py-12 text-center text-sm">
          Loading actions…
        </div>
      ) : completedItems.length === 0 ? (
        <div className="text-text-tertiary py-12 text-center text-sm">
          No completed actions yet.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {completedItems.map(a => (
              <div
                key={a.id}
                className="dark:border-success/40 dark:bg-success/10 flex items-center gap-3 rounded-md border border-[#86efac] bg-[#f0fdf4] p-4 shadow-sm">
                <span className="dark:bg-success/20 dark:text-success flex size-6.5 shrink-0 items-center justify-center rounded-full bg-[#bbf7d0] text-[#16a34a]">
                  <Check aria-hidden="true" className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="dark:text-success text-sm font-semibold text-[#15803d]">
                    {payloadStr(a.proposed_payload, "title") ??
                      a.type ??
                      "Action"}
                  </div>
                  <div className="dark:text-success/80 text-[13px] text-[#15803d]/80">
                    {extractDraft(a.proposed_payload)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <ListPagination
            currentPage={completedCurrentPage}
            totalPages={completedTotalPages}
            total={completedTotal}
            itemLabel="action"
            onPageChange={setCompletedPage}
          />
        </>
      )}
    </div>
  );
  // #endregion
}
