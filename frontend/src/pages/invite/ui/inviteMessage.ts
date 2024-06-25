import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";
import { when } from "lit/directives/when.js";

import type { UserOrgInviteInfo } from "@/types/user";

export const renderInviteMessage = (
  inviteInfo: void | UserOrgInviteInfo,
  { isExistingUser, isLoggedIn } = { isExistingUser: false, isLoggedIn: false },
) => {
  if (!inviteInfo) return;

  let message: string | TemplateResult = "";

  if (inviteInfo.firstOrgAdmin) {
    message = msg(
      "Finish setting up your Browsertrix account to start web archiving.",
    );
  } else {
    const { inviterName, orgName, fromSuperuser } = inviteInfo;

    if (inviterName && !fromSuperuser && orgName) {
      message = msg(
        html`You’ve been invited by
          <strong class="font-medium">${inviterName}</strong>
          to join the organization
          <span class="font-medium text-primary">${orgName}</span>
          on Browsertrix.`,
      );
    } else if (orgName) {
      message = msg(
        html`You’ve been invited to join the organization
          <span class="font-medium text-primary">${orgName}</span>
          on Browsertrix.`,
      );
    }
  }

  if (!message) return;

  return html`<p class="max-w-prose text-base text-neutral-600">${message}</p>
    ${when(
      inviteInfo.firstOrgAdmin,
      () => html`
        <ul class="mt-6 text-base text-neutral-600">
          <li class="mb-3 flex items-center gap-2">
            <sl-icon
              class="text-lg text-primary"
              name=${isLoggedIn ? "check-circle" : "1-circle"}
              label=${isLoggedIn ? msg("Step 1 complete") : msg("Step 1")}
            ></sl-icon>
            ${isExistingUser
              ? msg("Join organization")
              : msg("Create a password and display name")}
          </li>
          <li class="flex items-center gap-2">
            <sl-icon
              class="text-lg text-primary"
              name="2-circle"
              label=${msg("Step 2")}
            ></sl-icon>
            ${msg("Configure your organization")}
          </li>
        </ul>
      `,
    )}`;
};
