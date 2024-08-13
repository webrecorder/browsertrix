import { z } from "zod";

export const authSchema = z.object({
  username: z.string(),
  headers: z.object({
    Authorization: z.string(),
  }),
  /** Timestamp (milliseconds) when token expires */
  tokenExpiresAt: z.number(),
});
export type Auth = z.infer<typeof authSchema>;
