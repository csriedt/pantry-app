import type { Metadata } from "next";

import { RecipeBookScreen } from "@/screens/recipe-book-screen";

export const metadata: Metadata = { title: "Recipe book · Pantry" };

export default function RecipeBookPage() {
  return <RecipeBookScreen />;
}
