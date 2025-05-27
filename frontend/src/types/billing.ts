import { z } from "zod";

import { apiDateSchema } from "./api";

export enum SubscriptionStatus {
  Active = "active",
  Trialing = "trialing",
  TrialingCanceled = "trialing_canceled",
  PausedPaymentFailed = "paused_payment_failed",
  PaymentNeverMade = "payment_never_made",
  Cancelled = "cancelled",
}
export const subscriptionStatusSchema = z.nativeEnum(SubscriptionStatus);

export const subscriptionSchema = z.object({
  status: subscriptionStatusSchema,
  planId: z.string(),
  readOnlyOnCancel: z.boolean(),
  futureCancelDate: apiDateSchema.nullable(),
  subId: z.string(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const billingPortalSchema = z.object({
  portalUrl: z.string().url(),
});
export type BillingPortal = z.infer<typeof billingPortalSchema>;
