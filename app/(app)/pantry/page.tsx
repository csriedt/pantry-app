import { Suspense } from "react";

import { PantryScreen, type PantryState } from "./pantry-screen";

const STATES: PantryState[] = [
  "steady",
  "first-run",
  "loading",
  "stale",
  "error",
  "edge",
];

function toPantryState(state: string | undefined): PantryState {
  return STATES.includes(state as PantryState)
    ? (state as PantryState)
    : "steady";
}

async function PantryFromParams({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  return <PantryScreen state={toPantryState(state)} />;
}

export default function PantryPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  return (
    <Suspense fallback={<PantryScreen state="steady" />}>
      <PantryFromParams searchParams={searchParams} />
    </Suspense>
  );
}
