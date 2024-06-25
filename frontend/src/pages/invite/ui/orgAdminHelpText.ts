import { msg } from "@lit/localize";
import { html } from "lit";

export const renderOrgAdminHelpText = () => {
  return html`
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
  `;
};
