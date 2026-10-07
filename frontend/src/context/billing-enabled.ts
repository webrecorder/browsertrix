import { createContext } from "@lit/context";

export type BillingEnabledContext = boolean | undefined;

export const billingEnabledContext =
  createContext<BillingEnabledContext>("billingEnabled");
