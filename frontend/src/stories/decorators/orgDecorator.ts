import type { StoryContext, StoryFn } from "@storybook/web-components";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import mapValues from "lodash/fp/mapValues";

import orgMock from "@/__mocks__/api/orgs/[id]";
import { AppStateService } from "@/utils/state";

const { users, usage, quotas, ...org } = orgMock;

export type StorybookOrgProps = {
  orgUsers?: boolean;
  orgUsage?: boolean;
  orgQuotas?: boolean;
};

@customElement("btrix-storybook-org")
export class StorybookOrg extends LitElement {
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
      users: this.users ? users : {},
      usage: this.usage ? usage : {},
      quotas: this.quotas
        ? quotas
        : (mapValues(() => 0, quotas) as typeof quotas),
    });
  }

  render() {
    return html`<slot></slot>`;
  }
}

export function orgDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  const { orgUsers, orgUsage, orgQuotas } = args as StorybookOrgProps;

  return html`<btrix-storybook-org
    ?users=${orgUsers}
    ?usage=${orgUsage}
    ?quotas=${orgQuotas}
  >
    ${story(args, context)}
  </btrix-storybook-org>`;
}
