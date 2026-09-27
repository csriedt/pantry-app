"use client";

import { useAuth, useOrganization, useUser } from "@clerk/nextjs";
import { ArrowUpRight, Calendar, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useChat } from "@/components/app/chat-provider";
import { useModals } from "@/components/app/modal-provider";
import { AvatarInitials } from "@/components/patterns/avatar-initials";
import { SectionHeader } from "@/components/patterns/section-header";
import { SuggestCard } from "@/components/patterns/suggest-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApproveAction } from "@/hooks/actions/useApproveAction";
import { useDeleteAction } from "@/hooks/actions/useDeleteAction";
import { useDismissAction } from "@/hooks/actions/useDismissAction";
import { useEditAction } from "@/hooks/actions/useEditAction";
import { useListActions } from "@/hooks/actions/useListActions";
import { useRegenerateAction } from "@/hooks/actions/useRegenerateAction";
import { useGetAiUsage } from "@/hooks/ai/useGetAiUsage";
import { useCountDueActions } from "@/hooks/dashboard/useCountDueActions";
import { useCountPendingAssets } from "@/hooks/dashboard/useCountPendingAssets";
import { useGetPipelineOverview } from "@/hooks/dashboard/useGetPipelineOverview";
import { useListRecentLeads } from "@/hooks/dashboard/useListRecentLeads";
import { useCountActiveLeads } from "@/hooks/leads/useCountActiveLeads";
import { useSetScreenContext } from "@/hooks/global/useSetScreenContext";
import { toCardProps } from "@/lib/actions/actionDisplay";
import { leadStateLabel, leadStateVariant } from "@/lib/leads/leadDisplay";
import { useOnboardingState } from "@/lib/onboarding";
import { cn, getInitials } from "@/lib/utils";
import type { Action } from "@/types/actions/action";
import type { Lead } from "@/types/leads/lead";
import type { LeadState } from "@/types/leads/leadState";

const DASHBOARD_ACTION_LIMIT = 5;
const DASHBOARD_RECENT_LEADS_LIMIT = 3;

/** Left-to-right pipeline stage order, matching `getPipelineOverviewAction`. */
const PIPELINE_STAGE_LABELS: Record<LeadState, string> = {
  new_enquiry: "New",
  needs_response: "Needs reply",
  proposal_sent: "Proposal",
  follow_up: "Follow-up",
  active: "Active",
  overdue: "Overdue",
  won: "Won",
};

function leadSourceLine(lead: Lead): string {
  const line = [lead.entry_point, lead.company].filter(Boolean).join(" · ");
  return line || "—";
}

// #region HELPERS
function LinkText({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-coral-700 dark:text-coral-400 text-[13px] leading-none font-medium hover:underline">
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  foot,
  footTone,
  onClick,
  soon,
}: {
  label: string;
  value: React.ReactNode;
  foot?: string;
  footTone?: "success" | "warning";
  onClick?: () => void;
  soon?: boolean;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "border-border bg-surface rounded-md border px-4.5 py-4 shadow-sm transition-[box-shadow,border-color]",
        onClick &&
          "hover:border-coral-300 focus-visible:border-coral-300 focus-visible:ring-ring/20 cursor-pointer outline-none hover:shadow-md focus-visible:ring-[3px]",
        soon && "opacity-60"
      )}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-text-tertiary text-[11px] font-semibold tracking-[0.08em] uppercase">
          {label}
        </span>
        {soon && (
          <span className="border-border-subtle dark:border-border dark:bg-muted inline-flex items-center rounded-full border bg-neutral-100 px-1.5 py-px text-[8px] font-semibold tracking-[0.06em] text-neutral-400 uppercase">
            Soon
          </span>
        )}
      </div>
      <div
        className={cn(
          "text-[26px] leading-none font-bold tabular-nums",
          soon ? "text-neutral-400" : "text-foreground"
        )}>
        {value}
      </div>
      {foot && (
        <div
          className={cn(
            "mt-1.75 text-xs font-semibold",
            footTone === "success" && "text-success",
            footTone === "warning" && "text-warning",
            !footTone && "font-medium text-neutral-400"
          )}>
          {foot}
        </div>
      )}
    </div>
  );
}

/**
 * Monthly AI-spend KPI tile.
 *
 * Reuses `useGetAiUsage` — the same RQ key + ~3-min staleTime as the
 * usage popover — so both mounting together dedupe to one read.
 *
 * `monthly.pct` is a decimal string or `null`. Null means "no budget
 * to measure against" (no plan resolved), which is different from 0%
 * used, so the headline shows an em dash. We only `parseFloat` the
 * already-computed percent for display — we never derive it from
 * `cost_cents`. Cost is formatted (cents → rand), never used to
 * back-compute the percent.
 */
function formatCostCents(costCents: string): string {
  const rand = Number.parseFloat(costCents) / 100;
  return `R${rand.toFixed(2)} this month`;
}

/** Shared loading/error/value rendering for count-style KPI tiles. */
function kpiValue(
  isLoading: boolean,
  isError: boolean,
  value: number | null | undefined
): React.ReactNode {
  if (isLoading) {
    return (
      <Loader2 aria-hidden className="size-5 animate-spin text-neutral-400" />
    );
  }
  if (isError || value === null || value === undefined) return "—";
  return value;
}

function AiSpendCard() {
  // #region HOOKS
  const [usageQuery, dispatchUsage] = useGetAiUsage();

  React.useEffect(() => {
    dispatchUsage({ params: {} });
  }, [dispatchUsage]);
  // #endregion

  // #region DATA
  const usage = usageQuery.data?.data ?? null;
  const isLoading = usageQuery.isLoading || (usageQuery.isFetching && !usage);
  const isError = usageQuery.isError;

  const monthly = usage?.monthly ?? null;
  const value = isLoading ? (
    <Loader2 aria-hidden className="size-5 animate-spin text-neutral-400" />
  ) : isError || !monthly || monthly.pct === null ? (
    "—"
  ) : (
    `${Math.round(Number.parseFloat(monthly.pct))}%`
  );
  const foot =
    !isLoading && !isError && monthly
      ? formatCostCents(monthly.cost_cents)
      : undefined;
  // #endregion

  // #region VIEW
  return <KpiCard label="AI spend" value={value} foot={foot} />;
  // #endregion
}
// #endregion

export default function DashboardPage() {
  // #region HOOKS
  const router = useRouter();
  const { orgId } = useAuth();
  const { openComingSoon } = useModals();
  const { startOnboarding } = useChat();
  const { user, isLoaded } = useUser();
  const { organization } = useOrganization();
  const { onboarded, isLoading: onboardingLoading } = useOnboardingState();
  const firstName = user?.firstName ?? "";
  const [actionsQuery, fetchActions] = useListActions();
  const [, approveActionAsync] = useApproveAction();
  const [, dismissActionAsync] = useDismissAction();
  const [, deleteActionAsync] = useDeleteAction();
  const [, editActionAsync] = useEditAction();
  const [, regenerateActionAsync] = useRegenerateAction();
  const [activeLeadsQuery, fetchActiveLeadsCount] = useCountActiveLeads();
  const [dueActionsQuery, fetchDueActionsCount] = useCountDueActions();
  const [pendingAssetsQuery, fetchPendingAssetsCount] = useCountPendingAssets();
  const [pipelineQuery, fetchPipelineOverview] = useGetPipelineOverview();
  const [recentLeadsQuery, fetchRecentLeads] = useListRecentLeads();
  // Opt the dashboard into surface context — no entity to bind, but it lets
  // the model log "user is on the dashboard" and gives us a hook to hang
  // future dashboard-scoped guidance on. See `lib/chat/surfaceContext.ts`.
  useSetScreenContext({ surface: "dashboard" });
  // #endregion

  // #region EFFECTS
  React.useEffect(() => {
    if (!orgId) return;
    fetchActions({
      params: { status: "pending", page: 1, pageSize: DASHBOARD_ACTION_LIMIT },
    });
  }, [orgId, fetchActions]);

  React.useEffect(() => {
    if (!orgId) return;
    fetchActiveLeadsCount({ params: {} });
    fetchDueActionsCount({ params: {} });
    fetchPendingAssetsCount({ params: {} });
    fetchPipelineOverview({ params: {} });
    fetchRecentLeads({ params: { limit: DASHBOARD_RECENT_LEADS_LIMIT } });
  }, [
    orgId,
    fetchActiveLeadsCount,
    fetchDueActionsCount,
    fetchPendingAssetsCount,
    fetchPipelineOverview,
    fetchRecentLeads,
  ]);
  // #endregion

  // #region DATA
  const pendingItems = actionsQuery.data?.data?.items ?? [];
  const activeLeadsCount = activeLeadsQuery.data?.data?.count;
  const dueActions = dueActionsQuery.data?.data ?? null;
  const pendingAssetsCount = pendingAssetsQuery.data?.data?.count ?? 0;
  const pipelineStages = pipelineQuery.data?.data?.stages ?? [];
  const recentLeadsItems = recentLeadsQuery.data?.data?.items ?? [];

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

  // #region HANDLERS — first-visit onboarding trigger
  // On landing, a not-yet-onboarded user gets the AI-guided profile setup: seed
  // the onboarding greeting into the (empty) chat and open the panel. Gated on
  // the loaded + not-onboarded state from the server read so an onboarded user
  // never sees the chat wrongly auto-start while the read is in flight.
  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isLoaded || onboardingLoading || startedRef.current || onboarded)
      return;
    startedRef.current = true;
    startOnboarding({
      firstName,
      businessName: organization?.name ?? "",
    });
  }, [
    isLoaded,
    onboardingLoading,
    onboarded,
    firstName,
    organization,
    startOnboarding,
  ]);
  // #endregion

  // #region VIEW
  return (
    <div className="px-4 py-5 sm:px-8 sm:py-7">
      {/* Greeting */}
      <div className="mb-5 flex flex-col gap-2.5">
        <span className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">
          Tuesday · 19 June
        </span>
        <h1 className="font-display dark:text-foreground text-[28px] leading-tight font-bold tracking-[-0.02em] text-neutral-900">
          Welcome{firstName ? `, ${firstName}` : ""}.
        </h1>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Active leads"
          value={kpiValue(
            activeLeadsQuery.isLoading,
            activeLeadsQuery.isError,
            activeLeadsCount
          )}
          onClick={() => router.push("/leads?filter=active")}
        />
        <KpiCard
          label="Follow-ups due"
          value={kpiValue(
            dueActionsQuery.isLoading,
            dueActionsQuery.isError,
            dueActions?.count
          )}
          foot={
            !dueActionsQuery.isLoading &&
            !dueActionsQuery.isError &&
            dueActions &&
            dueActions.overdueCount > 0
              ? `${dueActions.overdueCount} overdue`
              : undefined
          }
          footTone="warning"
          onClick={() => router.push("/leads?filter=overdue")}
        />
        <KpiCard label="Proposals sent" value="—" foot="Deferred for V1" soon />
        <KpiCard label="Deals won" value="—" foot="Deferred for V1" soon />
        <AiSpendCard />
      </div>

      {/* Pipeline overview */}
      <div className="mb-6 flex flex-col gap-3">
        <SectionHeader
          label="Pipeline overview"
          action={
            <LinkText onClick={() => router.push("/pipeline")}>
              Open pipeline
            </LinkText>
          }
        />
        {pipelineQuery.isError ? (
          <div className="text-text-tertiary py-4 text-center text-sm">
            Failed to load pipeline overview.
          </div>
        ) : pipelineQuery.isLoading || pipelineQuery.data === undefined ? (
          <div className="text-text-tertiary py-4 text-center text-sm">
            Loading pipeline…
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {pipelineStages.map(st => (
              <button
                key={st.state}
                type="button"
                onClick={() => router.push("/pipeline")}
                className="border-border bg-surface flex-1 basis-2/5 rounded-md border px-4 py-3.5 text-left shadow-sm transition-shadow hover:shadow-md sm:basis-0">
                <div className="text-coral-700 dark:text-coral-400 text-[22px] leading-none font-bold tabular-nums">
                  {st.count}
                </div>
                <div className="text-text-secondary mt-1.5 text-xs font-semibold">
                  {PIPELINE_STAGE_LABELS[st.state]}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_1fr] lg:items-start">
        {/* Left: due actions */}
        <div className="flex flex-col gap-3.5">
          <SectionHeader
            label="Due actions — do these first"
            action={
              <LinkText onClick={() => router.push("/actions")}>
                All actions
              </LinkText>
            }
          />
          {actionsQuery.isError ? (
            <div className="text-text-tertiary py-4 text-center text-sm">
              Failed to load actions.
            </div>
          ) : actionsQuery.isLoading || actionsQuery.data === undefined ? (
            <div className="text-text-tertiary py-4 text-center text-sm">
              Loading actions…
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="text-text-tertiary py-4 text-center text-sm">
              No pending actions — you&apos;re all caught up!
            </div>
          ) : (
            pendingItems.map(a => {
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
            })
          )}
          {!pendingAssetsQuery.isLoading &&
            !pendingAssetsQuery.isError &&
            pendingAssetsCount > 0 && (
              <div className="border-coral-200 bg-coral-50 dark:border-coral-500/30 dark:bg-coral-500/10 flex items-center gap-2.5 rounded-md border px-4 py-3">
                <span className="text-coral-700 dark:text-coral-400">✦</span>
                <span className="text-coral-800 dark:text-coral-200 flex-1 text-[13px] font-medium">
                  {pendingAssetsCount} campaign asset
                  {pendingAssetsCount === 1 ? "" : "s"} waiting for your
                  approval.
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push("/campaigns")}>
                  Review
                </Button>
              </div>
            )}
        </div>

        {/* Right: content calendar (soon) + recent leads */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3.5">
            <SectionHeader
              label={
                <>
                  Content calendar
                  <span className="border-border-subtle dark:border-border dark:bg-muted inline-flex items-center rounded-full border bg-neutral-100 px-1.5 py-px text-[9px] font-semibold tracking-[0.06em] text-neutral-400 uppercase">
                    Soon
                  </span>
                </>
              }
            />
            <button
              type="button"
              onClick={() => openComingSoon("calendar")}
              className="border-border bg-surface overflow-hidden rounded-lg border text-left shadow-sm">
              <div className="px-4 opacity-50 grayscale-40">
                <div className="border-border-subtle flex items-center gap-3 border-b py-2.5">
                  <span className="text-text-tertiary w-10.5 shrink-0 text-center font-mono text-[11px] leading-tight font-semibold">
                    TUE
                    <br />
                    10:00
                  </span>
                  <div className="min-w-0">
                    <div className="text-foreground text-[13px] font-semibold">
                      Summer colour refresh
                    </div>
                    <div className="text-text-tertiary text-xs">
                      Instagram · Summer campaign
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 py-2.5">
                  <span className="text-text-tertiary w-10.5 shrink-0 text-center font-mono text-[11px] leading-tight font-semibold">
                    WED
                    <br />
                    17:30
                  </span>
                  <div className="min-w-0">
                    <div className="text-foreground text-[13px] font-semibold">
                      Midweek 15% off
                    </div>
                    <div className="text-text-tertiary text-xs">
                      Facebook · Quiet-Wednesday
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-border-subtle flex items-center gap-2 border-t bg-neutral-50 px-4 py-2.5 dark:bg-white/3">
                <Calendar
                  aria-hidden="true"
                  className="size-3.5 text-neutral-400"
                />
                <span className="text-text-tertiary text-xs font-medium">
                  Plan &amp; schedule posts — coming soon.
                </span>
              </div>
            </button>
          </div>

          <div className="flex flex-col gap-3.5">
            <SectionHeader
              label="Recent leads"
              action={
                <LinkText onClick={() => router.push("/leads")}>
                  All leads
                </LinkText>
              }
            />
            <div className="border-border bg-surface rounded-lg border px-4 shadow-sm">
              {recentLeadsQuery.isError ? (
                <div className="text-text-tertiary py-4 text-center text-sm">
                  Failed to load recent leads.
                </div>
              ) : recentLeadsQuery.isLoading ||
                recentLeadsQuery.data === undefined ? (
                <div className="text-text-tertiary py-4 text-center text-sm">
                  Loading leads…
                </div>
              ) : recentLeadsItems.length === 0 ? (
                <div className="text-text-tertiary py-4 text-center text-sm">
                  No leads yet.
                </div>
              ) : (
                recentLeadsItems.map((lead, i) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => router.push(`/leads/${lead.id}`)}
                    className={cn(
                      "flex w-full items-center gap-3 py-3 text-left",
                      i < recentLeadsItems.length - 1 &&
                        "border-border-subtle border-b"
                    )}>
                    <AvatarInitials initials={getInitials(lead.name)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground truncate text-sm font-semibold">
                        {lead.name ?? "Unnamed lead"}
                      </div>
                      <div className="text-text-tertiary truncate text-xs">
                        {leadSourceLine(lead)}
                      </div>
                    </div>
                    <Badge variant={leadStateVariant(lead.state)} dot size="sm">
                      {leadStateLabel(lead.state)}
                    </Badge>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-neutral-300"
                    />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  // #endregion
}
