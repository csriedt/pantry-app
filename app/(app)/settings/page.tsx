import type { Metadata } from "next";

import { SettingsScreen } from "@/screens/settings-screen";

export const metadata: Metadata = { title: "Settings · Pantry" };

export default function SettingsPage() {
  return <SettingsScreen />;
}
