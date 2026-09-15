import type { StoryContext, StoryFn } from "@storybook/web-components";
import { addDays } from "date-fns/fp";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import mapValues from "lodash/fp/mapValues";

import orgMock from "@/__mocks__/api/orgs/[id]";
import { TailwindElement } from "@/classes/TailwindElement";
import { SubscriptionStatus } from "@/types/billing";
import { type Onboarding } from "@/types/onboarding";
import { type OrgData } from "@/types/org";
import { AppStateService } from "@/utils/state";

const {
  users,
  usage,
  quotas,
  bytesStored,
  bytesStoredCrawls,
  bytesStoredUploads,
  bytesStoredProfiles,
  ...org
} = orgMock;

export const subscription = {
  subId: "storybook-subscription-id",
  planId: "starter",
  status: SubscriptionStatus.Active,
  futureCancelDate: addDays(7)(new Date()).toISOString(),
  readOnlyOnCancel: false,
};

export { orgMock, subscription as orgSubscriptionMock };

export type StorybookOrgProps = {
  orgUsers?: boolean | OrgData["users"];
  orgUsage?: boolean | OrgData["usage"];
  orgQuotas?: boolean | OrgData["quotas"];
  orgSubscription?: boolean | OrgData["subscription"];
  orgOnboarding?: Onboarding;
};

@customElement("btrix-storybook-org")
export class StorybookOrg extends TailwindElement {
  @property({ type: Object })
  users?: OrgData["users"];

  @property({ type: Object })
  usage?: OrgData["usage"];

  @property({ type: Object })
  quotas?: OrgData["quotas"];

  @property({ type: Object })
  subscription?: OrgData["subscription"];

  @property({ type: Object })
  onboarding?: Partial<Onboarding>;

  connectedCallback(): void {
    super.connectedCallback();

    // TODO Allow editing settings
    AppStateService.updateSettings({
      registrationEnabled: false,
      jwtTokenLifetime: 0,
      defaultBehaviorTimeSeconds: 0,
      defaultPageLoadTimeSeconds: 0,
      maxPagesPerCrawl: 0,
      numBrowsersPerInstance: 0,
      maxBrowserWindows: 0,
      billingEnabled: true,
      signUpUrl: "",
      salesEmail: "",
      supportEmail: "",
    });
    AppStateService.updateOrg({
      ...org,
      ...(this.usage
        ? {
            bytesStored,
            bytesStoredCrawls,
            bytesStoredUploads,
            bytesStoredProfiles,
          }
        : {
            bytesStored: 0,
            bytesStoredCrawls: 0,
            bytesStoredUploads: 0,
            bytesStoredProfiles: 0,
          }),
      users: this.users || {},
      usage: this.usage || {},
      subscription: this.subscription || null,
      quotas: this.quotas || (mapValues(() => 0, quotas) as typeof quotas),
      note: "",
    });

    if (this.onboarding) {
      AppStateService.partialUpdateOnboarding(this.onboarding);
    }
  }

  render() {
    return html`<div
      class="mx-auto box-border max-w-screen-desktop p-3 @container/org lg:px-10 lg:pb-10"
    >
      <slot></slot>
    </div>`;
  }
}

export function orgDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  const { orgUsers, orgUsage, orgQuotas, orgSubscription, orgOnboarding } =
    args as StorybookOrgProps;

  return html`<btrix-storybook-org
    .users=${orgUsers === true ? users : orgUsers || undefined}
    .usage=${orgUsage === true ? usage : orgUsage || undefined}
    .quotas=${orgQuotas === true ? quotas : orgQuotas || undefined}
    .subscription=${orgSubscription === true
      ? subscription
      : orgSubscription || undefined}
    .onboarding=${orgOnboarding}
  >
    ${story(args, context)}
  </btrix-storybook-org>`;
}
