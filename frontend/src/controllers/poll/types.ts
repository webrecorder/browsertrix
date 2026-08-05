import { type SetRequired } from "type-fest";
import { z } from "zod";

export const pollControllerOptionsSchema = z.object({
  timeoutSeconds: z.number().gt(0).finite().optional(),
  pauseWhenHidden: z.boolean().optional(),
  stopPollOnError: z.boolean().optional(),
});
export type PollControllerOptions = z.infer<typeof pollControllerOptionsSchema>;

export type PollControllerInitOptions = SetRequired<
  PollControllerOptions,
  "timeoutSeconds"
>;
