import z from "zod";

import type { APIController } from "@/controllers/api";
import { orgQuotasSchema } from "@/utils/orgs";

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  org_quotas: orgQuotasSchema,
  testmode: z.boolean(),
});

export const plansResponseSchema = z.object({
  plans: z.array(planSchema),
});

export type Plan = z.infer<typeof planSchema>;
export type PlansResponse = z.infer<typeof plansResponseSchema>;

export const defaultPlan: Plan = {
  id: "unset",
  name: "Unset",
  org_quotas: {
    extraExecMinutes: 0,
    giftedExecMinutes: 0,
    maxConcurrentCrawls: 0,
    maxExecMinutesPerMonth: 0,
    maxPagesPerCrawl: 0,
    storageQuota: 0,
  },
  testmode: false,
};

export async function fetchPlans(api: APIController): Promise<Plan[]> {
  const data = await api.fetch<PlansResponse>("/orgs/plans");
  return plansResponseSchema.parse(data).plans;
}
