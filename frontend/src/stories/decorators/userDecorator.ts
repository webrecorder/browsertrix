import type { StoryContext, StoryFn } from "@storybook/web-components";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

import userMock from "@/__mocks__/api/users/me";
import { AppStateService } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

export { userMock };

export type StorybookUserProps = {
  user?: boolean;
  auth?: boolean;
};

@customElement("btrix-storybook-user")
export class StorybookOrg extends LitElement {
  @property({ type: Boolean })
  user?: boolean;

  @property({ type: Boolean })
  auth?: boolean;

  connectedCallback(): void {
    super.connectedCallback();

    if (this.auth) {
      AppStateService.updateAuth({
        username: userMock.email,
        headers: { Authorization: "" },
        tokenExpiresAt: 1,
      });
    }

    if (this.user) {
      AppStateService.updateUser(formatAPIUser(userMock));
    }
  }

  render() {
    return html`<slot></slot>`;
  }
}

export function userDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  const { user, auth } = args as StorybookUserProps;

  return html`<btrix-storybook-user ?user=${user} ?auth=${auth}>
    ${story(args, context)}
  </btrix-storybook-user>`;
}
