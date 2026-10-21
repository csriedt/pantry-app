import type { Metadata } from "next";

import { PantryScreen } from "@/screens/pantry-screen";

export const metadata: Metadata = { title: "Pantry" };

export default function PantryPage() {
  return <PantryScreen />;
}
