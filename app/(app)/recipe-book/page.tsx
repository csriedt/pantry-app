import { Suspense } from "react";

import { RecipeBookScreen, type RecipeBookState } from "./recipe-book-screen";

const STATES: RecipeBookState[] = ["populated", "empty", "lookup"];

function toRecipeBookState(state: string | undefined): RecipeBookState {
  return STATES.includes(state as RecipeBookState)
    ? (state as RecipeBookState)
    : "populated";
}

async function RecipeBookFromParams({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  return <RecipeBookScreen state={toRecipeBookState(state)} />;
}

export default function RecipeBookPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  return (
    <Suspense fallback={<RecipeBookScreen state="populated" />}>
      <RecipeBookFromParams searchParams={searchParams} />
    </Suspense>
  );
}
