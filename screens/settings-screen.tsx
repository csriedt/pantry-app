"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { GraceBanner } from "@/components/composites/grace-banner";
import { DeleteAccountDialog } from "@/components/composites/settings/delete-account-dialog";
import { useSessionUserId } from "@/components/providers/session-user-provider";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/hooks/auth/useSignOut";
import { useCancelAccountDeletion } from "@/hooks/settings/useCancelAccountDeletion";
import { useGetAccountSummary } from "@/hooks/settings/useGetAccountSummary";
import { useRequestAccountDeletion } from "@/hooks/settings/useRequestAccountDeletion";
import { formatDayMonth } from "@/lib/dates";

export const SettingsScreen = () => {
  // #region HOOKS
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const userId = useSessionUserId();
  const [summaryQuery, dispatchSummary] = useGetAccountSummary(userId);
  const [requestDeletion, , isRequesting] = useRequestAccountDeletion(userId);
  const [cancelDeletion, , isCancelling] = useCancelAccountDeletion(userId);
  const [signOut, , isSigningOut] = useSignOut();
  // #endregion

  // #region CONSTANTS
  const summary = summaryQuery.data?.data;
  // #endregion

  // #region HANDLERS
  const onSignOut = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    signOut(undefined, { onSuccess: () => router.push("/sign-in") });
  };

  const onCancelDeletion = () => {
    cancelDeletion(undefined);
  };

  const onOpenDelete = () => {
    setIsDeleteOpen(true);
  };

  const onRequestDeletion = () => {
    requestDeletion(undefined, { onSuccess: () => setIsDeleteOpen(false) });
  };
  // #endregion

  // #region LIFECYCLE
  // A null id scopes nothing: no read runs until the session resolves.
  useEffect(() => {
    if (userId === null) return;
    dispatchSummary({ params: {} });
  }, [userId, dispatchSummary]);
  // #endregion

  // #region VIEW
  return (
    <div className="pb-6">
      {summary?.deletion_pending ? (
        <div className="px-4 pt-2 pb-1">
          <GraceBanner
            text={
              summary.deletion_execute_after
                ? `Account deletion requested · purges ${formatDayMonth(summary.deletion_execute_after)}`
                : "Account deletion requested"
            }
            actionLabel={isCancelling ? "Cancelling…" : "Cancel"}
            onAction={onCancelDeletion}
          />
        </div>
      ) : null}
      <header className="flex items-center gap-3 px-5 pt-1 pb-3">
        <h2 className="font-display text-[25px] font-semibold tracking-[-0.02em]">
          Settings
        </h2>
      </header>
      {summaryQuery.isError ? (
        <p role="alert" className="mx-5 text-[13px] text-danger">
          {summaryQuery.error?.message ?? "Couldn’t read your account."}
        </p>
      ) : null}
      <div className="mx-5 overflow-hidden rounded-card border border-border bg-surface">
        <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Account email</span>
            <span className="mt-0.5 block truncate text-small text-muted-foreground">
              {summary?.email ?? "…"}
            </span>
          </span>
        </div>
        {summary && !summary.deletion_pending ? (
          <button
            type="button"
            onClick={onOpenDelete}
            className="flex min-h-[60px] w-full items-center gap-3 border-t border-border px-4 py-3 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span className="min-w-0 flex-1 text-[15px] font-medium text-danger">
              Delete account
            </span>
          </button>
        ) : null}
      </div>
      <div className="mx-5 mt-4">
        <form onSubmit={onSignOut}>
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </Button>
        </form>
      </div>
      <DeleteAccountDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        isRequesting={isRequesting}
        onConfirm={onRequestDeletion}
      />
    </div>
  );
  // #endregion
};
