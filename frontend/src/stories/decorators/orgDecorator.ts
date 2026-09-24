import { provide } from "@lit/context";
import type { StoryContext, StoryFn } from "@storybook/web-components";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import mapValues from "lodash/fp/mapValues";

import orgMock from "@/__mocks__/api/orgs/[id]";
import {
  orgCrawlerChannelsContext,
  type OrgCrawlerChannelsContext,
} from "@/context/org-crawler-channels";
import {
  orgProxiesContext,
  type OrgProxiesContext,
} from "@/context/org-proxies";
import { type OrgData } from "@/types/org";
import { AppStateService } from "@/utils/state";

const { users, usage, quotas, ...org } = orgMock;

export { orgMock };

export type StorybookOrgProps = {
  orgFeatureFlags?: OrgData["featureFlags"];
  orgUsers?: boolean;
  orgUsage?: boolean;
  orgQuotas?: boolean;
};

@customElement("btrix-storybook-org")
export class StorybookOrg extends LitElement {
  @provide({ context: orgProxiesContext })
  proxies: OrgProxiesContext = {
    default_proxy_id: null,
    servers: [],
  };

  @provide({ context: orgCrawlerChannelsContext })
  crawlerChannels: OrgCrawlerChannelsContext = [
    { id: "default", image: "fake-crawler-channel" },
  ];

  @property({ type: Object })
  featureFlags?: OrgData["featureFlags"];

  @property({ type: Boolean })
  users?: boolean;

  @property({ type: Boolean })
  usage?: boolean;

  @property({ type: Boolean })
  quotas?: boolean;

  connectedCallback(): void {
    super.connectedCallback();

    AppStateService.updateOrg({
      ...org,
      featureFlags: this.featureFlags || {},
      users: this.users ? users : {},
      usage: this.usage ? usage : {},
      quotas: this.quotas
        ? quotas
        : (mapValues(() => 0, quotas) as typeof quotas),
      note: "",
    });
  }

  render() {
    return html`<slot></slot>`;
  }
}

export function orgDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  const { orgFeatureFlags, orgUsers, orgUsage, orgQuotas } =
    args as StorybookOrgProps;

  return html`<btrix-storybook-org
    .featureFlags=${orgFeatureFlags}
    ?users=${orgUsers}
    ?usage=${orgUsage}
    ?quotas=${orgQuotas}
  >
    ${story(args, context)}
  </btrix-storybook-org>`;
}
