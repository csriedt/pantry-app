"use client";

import { useAuth } from "@clerk/nextjs";
import { Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { useModals } from "@/components/app/modal-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useListOffers } from "@/hooks/offers/useListOffers";

export default function OffersPage() {
  // #region HOOKS
  const { orgId } = useAuth();
  const { openOffer, openDeleteOffer } = useModals();
  const [listQuery, listAction] = useListOffers();
  // #endregion

  // #region DATA
  React.useEffect(() => {
    if (!orgId) return;
    listAction({ params: { page: 1, pageSize: 100 } });
  }, [orgId, listAction]);

  const items = listQuery.data?.data?.items ?? [];
  // #endregion

  // #region VIEW
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-7">
      <PageHeader
        title="Offers & services"
        subtitle="What you sell — the foundation for every campaign."
        action={
          <Button variant="primary" onClick={() => openOffer()}>
            <Plus aria-hidden="true" />
            Add offer
          </Button>
        }
      />

      {listQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5 text-neutral-400" />
        </div>
      ) : listQuery.isError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-text-secondary text-center text-sm">
            Could not load offers. Please try again.
          </p>
          <Button
            variant="secondary"
            onClick={() => listAction({ params: { page: 1, pageSize: 100 } })}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-text-secondary py-12 text-center text-sm">
          No offers yet. Add your first offer to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map(o => {
            const typeLabel = o.offer_type
              ? o.offer_type.charAt(0).toUpperCase() + o.offer_type.slice(1)
              : null;
            return (
              <div
                key={o.id}
                className="border-border bg-surface flex flex-col gap-2.5 rounded-lg border p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <h3 className="dark:text-foreground text-[17px] font-semibold text-neutral-900">
                      {o.name}
                    </h3>
                    {typeLabel && (
                      <span className="inline-flex h-5.5 items-center rounded-md bg-teal-50 px-2.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                        {typeLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={() => openOffer(o.id)}
                      aria-label={`Edit ${o.name}`}>
                      <Pencil
                        aria-hidden="true"
                        className="size-3.5 text-neutral-500"
                      />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      aria-label={`Delete ${o.name}`}
                      onClick={() => openDeleteOffer(o.id, o.name)}>
                      <Trash2
                        aria-hidden="true"
                        className="size-3.5 text-neutral-400"
                      />
                    </Button>
                  </div>
                </div>
                {o.description && (
                  <p className="text-text-secondary text-sm leading-relaxed">
                    {o.description}
                  </p>
                )}
                <div className="border-border-subtle mt-0.5 flex items-center justify-between gap-2.5 border-t pt-3">
                  <span className="text-text-tertiary text-[13px]">
                    {o.target_audience ?? ""}
                  </span>
                  <span className="text-foreground text-[15px] font-bold">
                    {o.pricing_model ?? ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
  // #endregion
}
