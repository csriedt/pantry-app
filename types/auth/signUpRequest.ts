import { z } from "zod";

export const SignUpRequestSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim(),
  // Stricter than the auth server's floor (6) on purpose: a better
  // message here wins over a generic rejection upstream.
  password: z.string().min(8, { error: "Use at least 8 characters." }),
});

export type SignUpRequest = z.infer<typeof SignUpRequestSchema>;
