import { localized, msg } from "@lit/localize";
import type { SlSelect } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import sortBy from "lodash/fp/sortBy";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { AccessCode, type OrgData } from "@/types/org";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";

export type InviteSuccessDetail = {
  inviteEmail: string;
  orgId: string;
  isExistingUser: boolean;
};

const sortByName = sortBy("name");

/**
 * @event btrix-invite-success
 */
@localized()
@customElement("btrix-invite-form")
export class InviteForm extends TailwindElement {
  @property({ type: Object, attribute: false })
  authState?: AuthState;

  @property({ type: Array, attribute: false })
  orgs?: OrgData[] = [];

  @property({ type: Object, attribute: false })
  defaultOrg: Partial<OrgData> | null = null;

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  private readonly api = new APIController(this);

  render() {
    let formError;

    if (this.serverError) {
      formError = html`
        <div class="mb-5">
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    const sortedOrgs = sortByName(this.orgs) as unknown as OrgData[];

    return html`
      <form
        class="max-w-md"
        @submit=${this.onSubmit}
        aria-describedby="formError"
      >
        <div class="mb-5">
          <sl-select
            name="orgId"
            label=${msg("Organization")}
            placeholder=${msg("Select an org")}
            value=${ifDefined(
              this.defaultOrg?.id ||
                (this.orgs?.length === 1 ? this.orgs[0].id : undefined),
            )}
            ?disabled=${sortedOrgs.length === 1}
            required
          >
            ${sortedOrgs.map(
              (org) => html`
                <sl-option value=${org.id}>${org.name}</sl-option>
              `,
            )}
          </sl-select>
        </div>
        <div class="mb-5">
          <sl-select
            label=${msg("Role")}
            value=${AccessCode.owner}
            name="inviteRole"
          >
            <sl-option value=${AccessCode.owner}>${"Admin"}</sl-option>
            <sl-option value=${AccessCode.crawler}>${"Crawler"}</sl-option>
            <sl-option value=${AccessCode.viewer}>${"Viewer"}</sl-option>
          </sl-select>
        </div>
        <div class="mb-5">
          <sl-input
            id="inviteEmail"
            name="inviteEmail"
            type="email"
            label=${msg("Email")}
            placeholder=${msg("person@email.com", {
              desc: "Placeholder text for email to invite",
            })}
            required
          >
          </sl-input>
        </div>

        ${formError}

        <div class="text-right">
          <sl-button
            variant="primary"
            size="small"
            type="submit"
            ?loading=${this.isSubmitting}
            ?disabled=${this.isSubmitting}
            >${msg("Invite")}</sl-button
          >
        </div>
      </form>
    `;
  }

  async onSubmit(event: SubmitEvent) {
    const formEl = event.target as HTMLFormElement;
    event.preventDefault();

    if (!(await this.checkFormValidity(formEl))) return;

    this.serverError = undefined;
    this.isSubmitting = true;

    const { orgId, inviteEmail, inviteRole } = serialize(formEl) as {
      orgId: string;
      inviteEmail: string;
      inviteRole: string;
    };

    try {
      const data = await this.api.fetch<{ invited: string }>(
        `/orgs/${orgId}/invite`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: +inviteRole,
          }),
        },
      );

      // Reset fields except selected org ID
      formEl.reset();
      formEl.querySelector<SlSelect>('[name="orgId"]')!.value = orgId;

      this.dispatchEvent(
        new CustomEvent<InviteSuccessDetail>("btrix-invite-success", {
          detail: {
            inviteEmail,
            orgId,
            isExistingUser: data.invited === "existing_user",
          },
          composed: true,
        }),
      );
    } catch (e) {
      if (isApiError(e)) {
        this.serverError = e.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
