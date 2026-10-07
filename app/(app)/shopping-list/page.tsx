import { Suspense } from "react";

import { ShoppingListScreen } from "./shopping-list-screen";

async function ShoppingListFromParams({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  return <ShoppingListScreen state={state === "empty" ? "empty" : "populated"} />;
}

export default function ShoppingListPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  return (
    <Suspense fallback={<ShoppingListScreen state="populated" />}>
      <ShoppingListFromParams searchParams={searchParams} />
    </Suspense>
  );
}
