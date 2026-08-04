import { Task } from "@lit/task";
import { z } from "zod";

export const pollControllerOptionsSchema = z.object({
  timeoutSeconds: z.number().int().optional(),
  pauseInBackground: z.boolean().optional(),
});
export type PollControllerOptions = z.infer<typeof pollControllerOptionsSchema>;

const pollControllerInitOptionsSchema = pollControllerOptionsSchema.merge(
  z.object({
    task: z.instanceof(Task),
  }),
);
export type PollControllerInitOptions = z.infer<
  typeof pollControllerInitOptionsSchema
>;
