import { z } from "zod";

export const SignInRequestSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim(),
  password: z.string().min(1, { error: "Enter your password." }),
});

export type SignInRequest = z.infer<typeof SignInRequestSchema>;
