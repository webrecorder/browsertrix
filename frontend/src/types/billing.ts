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
  renewalDate: apiDateSchema.nullable().optional(),
  subId: z.string(),
  /* Billing cycle as interval + count (quarterly = month × 3, a 3-year
     agreement = year × 3). None when the cadence isn't one we sell. */
  billingInterval: z.enum(["month", "year"]).nullable().optional(),
  billingIntervalCount: z.number().int().positive().nullable().optional(),
  /* Pending storage add-on quantity (GB) taking effect at the next renewal.
     Absent/None means no change is pending; 0 means a cancellation. */
  storageAddonPendingGB: z.number().nullable().optional(),
  /* Plan taking effect at the next renewal, if a plan change is waiting. */
  pendingPlanId: z.string().nullable().optional(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const billingPortalSchema = z.object({
  portalUrl: z.string().url(),
});
export type BillingPortal = z.infer<typeof billingPortalSchema>;
export const billingAddonCheckoutSchema = z.object({
  checkoutUrl: z.string().url(),
});
export type BillingAddonCheckout = z.infer<typeof billingAddonCheckoutSchema>;
