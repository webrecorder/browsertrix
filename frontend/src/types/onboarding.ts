export type Onboarding = {
  orgId: string;
  showOnboarding?: boolean;
  stepsComplete?: Record<number, boolean>;
};
