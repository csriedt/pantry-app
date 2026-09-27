"use client";

import { ChevronRight, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { useModals } from "@/components/app/modal-provider";
import { AvatarInitials } from "@/components/patterns/avatar-initials";
import { ListPagination } from "@/components/patterns/list-pagination";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListLeads } from "@/hooks/leads/useListLeads";
import { leadStateLabel, leadStateVariant } from "@/lib/leads/leadDisplay";
import { getInitials } from "@/lib/utils";
import type { LeadState } from "@/types/leads/leadState";

// #region HELPERS
const STATE_OPTIONS = [
  { value: "all", label: "All states" },
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "new_enquiry", label: "New Enquiry" },
  { value: "needs_response", label: "Needs Response" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "won", label: "Won" },
];

const PAGE_SIZE = 50;
// #endregion

function LeadsView() {
  // #region HOOKS
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAddLead } = useModals();
  const [query, action] = useListLeads();
  // #endregion

  // #region STATE
  const [search, setSearch] = React.useState("");
  const [state, setState] = React.useState(searchParams.get("filter") ?? "all");
  const [page, setPage] = React.useState(1);
  // #endregion

  // #region HANDLERS
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStateChange = (value: string) => {
    setState(value);
    setPage(1);
  };
  // #endregion

  const leads = query.data?.data?.items ?? [];
  const total = query.data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // `page` can end up past `totalPages` if the list shrinks (e.g. deleting
  // the last lead on the last page) — clamp what's fetched/rendered rather
  // than looping a setState back through an effect.
  const currentPage = Math.min(page, totalPages);
  const activeFilterCount = state !== "all" ? 1 : 0;

  React.useEffect(() => {
    action({
      params: {
        page: currentPage,
        pageSize: PAGE_SIZE,
        state: state !== "all" ? (state as LeadState) : undefined,
        search: search.trim() || undefined,
      },
    });
  }, [action, currentPage, state, search]);
  // #endregion

  // #region VIEW
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-7">
      <PageHeader
        title="Leads"
        subtitle={`${total} active · never drop a lead again.`}
        action={
          <Button variant="primary" onClick={openAddLead}>
            <Plus aria-hidden="true" />
            Add lead
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="bg-surface dark:bg-surface-elevated flex h-10 min-w-45 flex-1 items-center gap-2.5 rounded-lg border border-neutral-300 px-3">
          <Search aria-hidden="true" className="size-4 text-neutral-400" />
          <input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search leads…"
            className="text-foreground min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>

        {/* Desktop: state filter */}
        <div className="hidden items-center gap-2.5 sm:flex">
          <Select
            items={STATE_OPTIONS}
            value={state}
            onValueChange={v => handleStateChange(String(v))}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mobile: filter popover */}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="secondary"
                size="icon-md"
                aria-label="Filters"
                className="relative sm:hidden"
              />
            }>
            <SlidersHorizontal aria-hidden="true" />
            {activeFilterCount > 0 && (
              <span className="bg-coral-600 absolute -top-1.5 -right-1.5 inline-flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <span className="text-text-tertiary text-[11px] font-semibold tracking-[0.06em] uppercase">
              Filters
            </span>
            <Select
              items={STATE_OPTIONS}
              value={state}
              onValueChange={v => handleStateChange(String(v))}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      <div className="border-border bg-surface overflow-hidden rounded-lg border shadow-sm">
        <div className="border-border hidden grid-cols-[1.3fr_1.1fr_1fr_0.8fr_1.1fr_auto] gap-3 border-b bg-neutral-50 px-4.5 py-2.5 lg:grid dark:bg-white/3">
          {["Lead", "Company", "State", "Source", "Email", ""].map(h => (
            <span
              key={h}
              className="text-text-tertiary text-[11px] font-semibold tracking-[0.06em] uppercase">
              {h}
            </span>
          ))}
        </div>

        {query.isLoading && (
          <div className="text-text-tertiary px-6 py-12 text-center text-sm">
            Loading leads…
          </div>
        )}

        {!query.isLoading &&
          leads.map(lead => (
            <button
              key={lead.id}
              type="button"
              onClick={() => router.push(`/leads/${lead.id}`)}
              className="border-border-subtle grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-neutral-50 lg:grid-cols-[1.3fr_1.1fr_1fr_0.8fr_1.1fr_auto] lg:px-4.5 dark:hover:bg-white/3">
              <div className="flex min-w-0 items-center gap-2.5">
                <AvatarInitials initials={getInitials(lead.name)} size="lg" />
                <div className="min-w-0">
                  <div className="text-foreground truncate text-sm font-semibold">
                    {lead.name ?? "—"}
                  </div>
                  <div className="text-text-tertiary truncate text-xs lg:hidden">
                    {[lead.company, lead.entry_point, lead.contact_email]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
              <span className="text-text-secondary hidden truncate text-sm lg:block">
                {lead.company ?? "—"}
              </span>
              <div className="justify-self-end lg:justify-self-start">
                <Badge variant={leadStateVariant(lead.state)} dot size="sm">
                  {leadStateLabel(lead.state)}
                </Badge>
              </div>
              <span className="text-text-secondary hidden text-sm lg:block">
                {lead.entry_point ?? "—"}
              </span>
              <span className="text-text-secondary hidden truncate text-sm lg:block">
                {lead.contact_email ?? "—"}
              </span>
              <div className="col-span-2 hidden items-center justify-end lg:col-span-1 lg:flex">
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-neutral-300"
                />
              </div>
            </button>
          ))}

        {!query.isLoading && leads.length === 0 && (
          <div className="text-text-tertiary px-6 py-12 text-center text-sm">
            {query.isError
              ? "Failed to load leads."
              : "No leads match these filters."}
          </div>
        )}
      </div>

      {!query.isLoading && total > 0 && (
        <ListPagination
          currentPage={currentPage}
          totalPages={totalPages}
          total={total}
          itemLabel="lead"
          onPageChange={setPage}
        />
      )}
    </div>
  );
  // #endregion
}

export default function LeadsPage() {
  return (
    <React.Suspense>
      <LeadsView />
    </React.Suspense>
  );
}
