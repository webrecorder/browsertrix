import { msg } from "@lit/localize";
import { html } from "lit";

import { AnalyticsTrackEvent } from "@/trackEvents";
import { track } from "@/utils/analytics";
import appState, { AppStateService } from "@/utils/state";

export enum OnboardingStep {
  OpenUserGuide = "Open User Guide",
  CreateWorkflow = "Create Workflow",
  ReplayItem = "Replay Item",
  ReviewPlan = "Review Plan",
}

export const onboardingSteps = [
  {
    key: OnboardingStep.OpenUserGuide,
    label: msg("Locate the user guide"),
    description: msg(
      "To open the user guide without leaving the Browsertrix application, select the “User Guide” button at the top of each page.",
    ),
  },
  {
    key: OnboardingStep.CreateWorkflow,
    label: msg("Create a crawl workflow"),
    description: msg(
      "Open the “Create New...” dropdown menu at the top of your dashboard and choose “Crawl Workflow”.",
    ),
  },
  {
    key: OnboardingStep.ReplayItem,
    label: msg("Replay crawled item"),
    description: msg(
      "Navigate to “Archived Items”, select the crawled item, and go to “Replay” to view an interactive replay of crawled pages.",
    ),
  },
  {
    key: OnboardingStep.ReviewPlan,
    label: msg("Review your plan"),
    description: msg(
      html`Navigate to “Settings” and review “Billing & Usage” to confirm that
      the current plan is right for you.`,
    ),
  },
] as const;

export function completeOnboardingStep(step: OnboardingStep) {
  if (appState.onboarding?.stepsComplete?.[step]) return;

  AppStateService.partialUpdateOnboarding({
    stepsComplete: { [step]: true },
  });

  track(AnalyticsTrackEvent.CompleteOnboardingStep, {
    completed_onboarding_step: step,
  });
}
