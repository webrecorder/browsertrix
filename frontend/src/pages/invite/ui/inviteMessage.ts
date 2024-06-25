import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";
import { when } from "lit/directives/when.js";

import type { UserOrgInviteInfo } from "@/types/user";

export const renderInviteMessage = (
  inviteInfo: void | UserOrgInviteInfo,
  { isExistingUser, isOrgMember } = {
    isExistingUser: false,
    isOrgMember: false,
  },
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

  return html`<p class="max-w-prose text-base text-neutral-700">${message}</p>
    ${when(
      inviteInfo.firstOrgAdmin,
      () => html`
        <ul class="mt-6 text-base text-neutral-700">
          <li class="mb-3 flex items-center gap-2">
            <sl-icon
              class="text-lg text-primary"
              name=${isOrgMember ? "check-circle" : "1-circle"}
              label=${isOrgMember ? msg("Step 1 complete") : msg("Step 1")}
            ></sl-icon>
            ${isExistingUser
              ? msg("Join organization")
              : msg("Create password and display name")}
          </li>
          <li class="flex items-center gap-2">
            <sl-icon
              class="text-lg text-primary"
              name="2-circle"
              label=${msg("Step 2")}
            ></sl-icon>
            ${msg("Configure organization")}
          </li>
        </ul>
        <div
          class="${isOrgMember
            ? "opacity-100"
            : "opacity-0 pointer-events-none"} transition-opacity"
        >
          <sl-divider class="mt-8"></sl-divider>
          <h2 class="mb-3 italic text-primary">${msg("What is an org?")}</h2>
          <p class="mb-3 text-neutral-600">
            ${msg(
              "An org, or organization, is a workspace for web archiving. If you’re archiving collaboratively, an org workspace can be shared between team members.",
            )}
          </p>
          <p class="text-neutral-600">
            ${msg(
              html`Refer to our user guide on
                <a
                  class="text-neutral-500 underline hover:text-primary"
                  href="https://docs.browsertrix.com/user-guide/org-settings/"
                  target="_blank"
                  rel="noopener"
                >
                  org settings
                </a>
                for details.`,
            )}
          </p>
        </div>
      `,
    )}`;
};
