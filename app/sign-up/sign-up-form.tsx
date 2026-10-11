"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useSignUp } from "@/hooks/auth/useSignUp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const SignUpForm = () => {
  const router = useRouter();
  const [signUp, , isPending] = useSignUp();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    signUp(
      {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      },
      {
        onSuccess: () => router.push("/pantry"),
        onError: error => setErrorMessage(error.message),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      {errorMessage ? (
        <p className="m-0 text-small text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="m-0 text-center text-small text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-ink underline">
          Sign in
        </Link>
      </p>
    </form>
  );
};
