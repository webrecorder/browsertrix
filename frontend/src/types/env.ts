import { z } from "zod";

export const envSchema = z.object({
  version: z.string(),
  registrationEnabled: z.boolean(),
  billingEnabled: z.boolean(),
  docsUrl: z.string(),
  signUpUrl: z.string(),
});
export type Env = z.infer<typeof envSchema>;
