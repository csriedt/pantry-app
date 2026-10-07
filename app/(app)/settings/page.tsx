import { Suspense } from "react";

import { SettingsScreen } from "./settings-screen";

type SettingsState = "root" | "grace" | "delete" | "deleted";

function toSettingsState(state: string | undefined): SettingsState {
  return state === "grace" || state === "delete" || state === "deleted"
    ? state
    : "root";
}

async function SettingsFromParams({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  return <SettingsScreen state={toSettingsState(state)} />;
}

export default function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  return (
    <Suspense fallback={<SettingsScreen state="root" />}>
      <SettingsFromParams searchParams={searchParams} />
    </Suspense>
  );
}
