import type { Metadata } from "next";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Pantry" };

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 pb-10">
      <header className="mb-8">
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">
          Sign in
        </h1>
        <p className="mt-1.5 mb-0 text-[14.5px] leading-normal text-muted-foreground">
          Your pantry, synced across your devices.
        </p>
      </header>
      <SignInForm />
    </main>
  );
}
