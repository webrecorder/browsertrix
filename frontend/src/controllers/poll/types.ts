import { type SetRequired } from "type-fest";
import { z } from "zod";

export const pollTaskOptionsSchema = z.object({
  timeoutSeconds: z.number().gt(0).finite().optional(),
  pauseWhenHidden: z.boolean().optional(),
  stopPollOnError: z.boolean().optional(),
});
export type PollTaskOptions = z.infer<typeof pollTaskOptionsSchema>;

export type PollTaskInitOptions = SetRequired<
  PollTaskOptions,
  "timeoutSeconds"
>;
