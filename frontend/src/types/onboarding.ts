export type Onboarding = {
  orgId: string;
  noUsage?: boolean;
  trialing?: boolean;
  stepsComplete?: Record<number, boolean>;
};
