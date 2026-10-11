import type { Metadata } from "next";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account · Pantry" };

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 pb-10">
      <header className="mb-8">
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">
          Create your account
        </h1>
        <p className="mt-1.5 mb-0 text-[14.5px] leading-normal text-muted-foreground">
          One account, every device, one pantry.
        </p>
      </header>
      <SignUpForm />
    </main>
  );
}
