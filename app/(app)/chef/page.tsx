import type { Metadata } from "next";

import { ChefScreen } from "@/screens/chef-screen";

export const metadata: Metadata = { title: "Chef · Pantry" };

export default function ChefPage() {
  return <ChefScreen />;
}
