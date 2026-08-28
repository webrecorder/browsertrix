import type { StoryContext, StoryFn } from "@storybook/web-components";
import { addDays } from "date-fns/fp";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import mapValues from "lodash/fp/mapValues";

import orgMock from "@/__mocks__/api/orgs/[id]";
import { SubscriptionStatus } from "@/types/billing";
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
};

@customElement("btrix-storybook-org")
export class StorybookOrg extends LitElement {
  @property({ type: Object })
  users?: OrgData["users"];

  @property({ type: Object })
  usage?: OrgData["usage"];

  @property({ type: Object })
  quotas?: OrgData["quotas"];

  @property({ type: Object })
  subscription?: OrgData["subscription"];

  connectedCallback(): void {
    super.connectedCallback();

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
  }

  render() {
    return html`<slot></slot>`;
  }
}

export function orgDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  const { orgUsers, orgUsage, orgQuotas, orgSubscription } =
    args as StorybookOrgProps;

  return html`<btrix-storybook-org
    .users=${orgUsers === true ? users : orgUsers || undefined}
    .usage=${orgUsage === true ? usage : orgUsage || undefined}
    .quotas=${orgQuotas === true ? quotas : orgQuotas || undefined}
    .subscription=${orgSubscription === true
      ? subscription
      : orgSubscription || undefined}
  >
    ${story(args, context)}
  </btrix-storybook-org>`;
}
