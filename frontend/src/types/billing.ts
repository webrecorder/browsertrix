import { z } from "zod";

import { apiDateSchema } from "./api";

export enum SubscriptionStatus {
  Active = "active",
  PausedPaymentFailed = "paused_payment_failed",
  Cancelled = "cancelled",
}
export const subscriptionStatusSchema = z.nativeEnum(SubscriptionStatus);

export const subscriptionSchema = z.object({
  status: subscriptionStatusSchema,
  planId: z.string(),
  futureCancelDate: apiDateSchema.nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const billingPortalSchema = z.object({
  portalUrl: z.string().url(),
});
export type BillingPortal = z.infer<typeof billingPortalSchema>;
