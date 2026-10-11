"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent } from "react";

import { useSignOut } from "@/hooks/auth/useSignOut";
import { GraceBanner } from "@/components/composites/grace-banner";
import { TypeToConfirm } from "@/components/composites/type-to-confirm";
import { Button } from "@/components/ui/button";

// #region TYPES
type SettingsState = "root" | "grace" | "delete" | "deleted";

interface SettingsScreenProperties {
  state: SettingsState;
}
// #endregion

const ROWS: {
  label: string;
  value?: string;
  danger?: boolean;
  href?: string;
}[] = [
  { label: "Account email", value: "cook@example.com", href: "#" },
  {
    label: "Chef budget today",
    value: "Today's chef budget is used. Resets tomorrow.",
  },
  { label: "Data & privacy", href: "#" },
  { label: "Delete account", danger: true, href: "/settings?state=delete" },
];

export const SettingsScreen = (props: SettingsScreenProperties) => {
  // #region CONSTANTS
  const { state } = props;
  const router = useRouter();
  const [signOut, , isSigningOut] = useSignOut();
  // #endregion

  // #region HELPERS
  const onSignOut = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    signOut(undefined, { onSuccess: () => router.push("/sign-in") });
  };

  const chevron = (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-[18px] flex-none text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );

  const settingsList = (
    <div className="mx-5 overflow-hidden rounded-card border border-border bg-surface">
      {ROWS.map(row => {
        const body = (
          <>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[15px] font-medium ${row.danger ? "text-danger" : ""}`}
              >
                {row.label}
              </span>
              {row.value ? (
                <span className="mt-0.5 block text-small text-muted-foreground">
                  {row.value}
                </span>
              ) : null}
            </span>
            {row.href ? chevron : null}
          </>
        );

        return row.href ? (
          <Link
            key={row.label}
            href={row.href}
            className="flex min-h-[60px] items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
          >
            {body}
          </Link>
        ) : (
          <div
            key={row.label}
            className="flex min-h-[60px] items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
  // #endregion

  // #region VIEW
  if (state === "deleted") {
    return (
      <div className="flex min-h-[75dvh] flex-col justify-center gap-4 px-6 pb-10">
        <h2 className="font-display text-screen leading-tight font-semibold">
          This account was deleted.
        </h2>
        <p className="m-0 text-[14.5px] leading-normal text-muted-foreground">
          Your pantry, meals, and history are gone. De-identified usage records
          remain.
        </p>
        <Button className="mt-1.5 w-full">Start over</Button>
      </div>
    );
  }

  if (state === "delete") {
    return (
      <div>
        <header className="flex items-center gap-3 px-5 pt-1 pb-3">
          <Link
            href="/settings"
            aria-label="Back"
            className="grid size-11 flex-none place-items-center rounded-full border border-strong bg-surface"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <h2 className="font-display text-[25px] font-semibold tracking-[-0.02em]">
            Delete account
          </h2>
        </header>
        <div className="px-5 pt-1">
          <p className="m-0 mb-5 max-w-[44ch] text-[14px] leading-[1.55] text-muted-foreground">
            Your pantry, meals, and history are purged after a 7-day grace
            period. You can cancel anytime before then.
          </p>
          <TypeToConfirm
            label="Type DELETE to confirm"
            word="DELETE"
            actionLabel="Delete account"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {state === "grace" ? (
        <div className="px-4 pt-2 pb-1">
          <GraceBanner
            text="Account deletion requested · purges 20 Oct"
            actionLabel="Cancel"
          />
        </div>
      ) : null}
      <header className="flex items-center gap-3 px-5 pt-1 pb-3">
        <h2 className="font-display text-[25px] font-semibold tracking-[-0.02em]">
          Settings
        </h2>
      </header>
      {settingsList}
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
    </div>
  );
  // #endregion
};
