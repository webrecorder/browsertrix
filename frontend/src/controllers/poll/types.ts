import type { Task } from "@lit/task";
import { z } from "zod";

export const pollControllerOptionsSchema = z.object({
  timeoutSeconds: z.number().int().optional(),
  pauseWhenHidden: z.boolean().optional(),
  stopPollOnError: z.boolean().optional(),
});
export type PollControllerOptions = z.infer<typeof pollControllerOptionsSchema>;

export type PollControllerInitOptions<T> = PollControllerOptions & {
  task: Task<readonly unknown[], T>;
};
