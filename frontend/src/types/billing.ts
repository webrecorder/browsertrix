export enum SubscriptionStatus {
  Active = "active",
  PausedPaymentFailed = "paused_payment_failed",
  Cancelled = "cancelled",
}

export type Subscription = {
  status: SubscriptionStatus;
  planId: string;
  futureCancelDate: null | string; // UTC datetime string
};

export type BillingPortal = {
  portalUrl: string;
};
