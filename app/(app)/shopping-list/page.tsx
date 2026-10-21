import type { Metadata } from "next";

import { ShoppingListScreen } from "@/screens/shopping-list-screen";

export const metadata: Metadata = { title: "Shopping list · Pantry" };

export default function ShoppingListPage() {
  return <ShoppingListScreen />;
}
