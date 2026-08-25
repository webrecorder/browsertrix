import { msg } from "@lit/localize";
import { html } from "lit";
import { type ArrayIndices } from "type-fest";

import { AnalyticsTrackEvent } from "@/trackEvents";
import { SubscriptionStatus } from "@/types/billing";
import { track } from "@/utils/analytics";
import appState, { AppStateService } from "@/utils/state";

export const onboardingSteps = [
  {
    label: msg("Locate the user guide"),
    description: msg(
      "To open the user guide without leaving the Browsertrix application, select the “User Guide” button at the top of each page.",
    ),
    track: () => {
      if (appState.org?.subscription?.status !== SubscriptionStatus.Trialing) {
        return;
      }

      track(AnalyticsTrackEvent.TrialOpenedUserGuide);
    },
  },
  {
    label: msg("Create a crawl workflow"),
    description: msg(
      "Open the “Create New...” dropdown menu at the top of your dashboard and choose “Crawl Workflow”.",
    ),
    track: () => {
      if (appState.org?.subscription?.status !== SubscriptionStatus.Trialing) {
        return;
      }

      track(AnalyticsTrackEvent.TrialCreatedWorkflow);
    },
  },
  {
    label: msg("Replay crawled item"),
    description: msg(
      "Navigate to “Archived Items”, select the crawled item, and go to “Replay” to view an interactive replay of crawled pages.",
    ),
    track: () => {
      if (appState.org?.subscription?.status !== SubscriptionStatus.Trialing) {
        return;
      }

      track(AnalyticsTrackEvent.TrialReplayedCrawledItem);
    },
  },
  {
    label: msg("Review your plan"),
    description: msg(
      html`Navigate to “Settings” and review “Billing & Usage” to confirm that
      the current plan is right for you.`,
    ),
    track: () => {
      if (appState.org?.subscription?.status !== SubscriptionStatus.Trialing) {
        return;
      }

      track(AnalyticsTrackEvent.TrialVisitedBillingTab);
    },
  },
] as const;

export function completeOnboardingStep(
  stepIndex: ArrayIndices<typeof onboardingSteps>,
) {
  if (appState.onboarding?.stepsComplete?.[stepIndex]) return;

  AppStateService.partialUpdateOnboarding({
    stepsComplete: { [stepIndex]: true },
  });

  onboardingSteps[stepIndex].track();
}
