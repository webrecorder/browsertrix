import { localized, msg, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import slugify from "slugify";

import { TailwindElement } from "@/classes/TailwindElement";
import type { UserOrgInviteInfo } from "@/types/user";
import type { AuthState } from "@/utils/AuthService";

@localized()
@customElement("btrix-org-fields")
export class OrgFields extends TailwindElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  inviteInfo?: UserOrgInviteInfo;

  render() {
    if (!this.inviteInfo) return;

    const inviteInfo = this.inviteInfo;

    if (!inviteInfo.firstOrgAdmin || !inviteInfo.orgNameRequired) return;

    const helpText = (slug: unknown) =>
      msg(
        str`Your org home page will be
        ${window.location.protocol}//${window.location.hostname}/orgs/${slug || ""}`,
      );

    return html`
      <div class="mb-5">
        <sl-input
          name="orgName"
          label=${msg("Name of your organization")}
          placeholder=${msg("My Organization")}
          autocomplete="off"
          value=${inviteInfo.orgName || ""}
          minlength="2"
          maxlength="40"
          help-text=${msg("You can change this in your org settings later.")}
        >
          <sl-icon name="check-lg" slot="suffix"></sl-icon>
        </sl-input>
      </div>
      <div class="mb-5">
        <sl-input
          name="orgSlug"
          label=${msg("Custom URL identifier")}
          placeholder="my-organization"
          autocomplete="off"
          value=${inviteInfo.orgSlug || ""}
          minlength="2"
          maxlength="30"
          help-text=${helpText(inviteInfo.orgSlug)}
          @sl-input=${(e: InputEvent) => {
            const input = e.target as SlInput;
            input.helpText = helpText(slugify(input.value, { strict: true }));
          }}
        >
        </sl-input>
      </div>
    `;
  }
}
