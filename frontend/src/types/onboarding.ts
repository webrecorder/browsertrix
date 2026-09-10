import { type OnboardingStep } from "@/utils/onboarding/onboardingEvents";

export type Onboarding = {
  orgId: string;
  showOnboarding?: boolean;
  stepsComplete?: Partial<Record<OnboardingStep, boolean>>;
};
