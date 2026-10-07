import { Suspense } from "react";

import { ChefScreen, type ChefState } from "./chef-screen";

const STATES: ChefState[] = [
  "conversation",
  "empty",
  "streaming",
  "collision",
  "lookup",
  "intent",
  "error",
];

function toChefState(state: string | undefined): ChefState {
  return STATES.includes(state as ChefState)
    ? (state as ChefState)
    : "conversation";
}

async function ChefFromParams({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  return <ChefScreen state={toChefState(state)} />;
}

export default function ChefPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  return (
    <Suspense fallback={<ChefScreen state="conversation" />}>
      <ChefFromParams searchParams={searchParams} />
    </Suspense>
  );
}
