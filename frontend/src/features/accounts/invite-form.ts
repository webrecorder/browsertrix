import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlSelect } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import sortBy from "lodash/fp/sortBy";

import { BtrixElement } from "@/classes/BtrixElement";
import { AccessCode, type OrgData } from "@/types/org";
import { isApiError } from "@/utils/api";

export type InviteSuccessDetail = {
  inviteEmail: string;
  orgId: string;
  isExistingUser: boolean;
};

const sortByName = sortBy("name");

/**
 * @event btrix-invite-success
 */
@customElement("btrix-invite-form")
@localized()
export class InviteForm extends BtrixElement {
  @property({ type: Array, attribute: false })
  orgs?: OrgData[] = [];

  @property({ type: Object, attribute: false })
  defaultOrg: Partial<OrgData> | null = null;

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  @state()
  private isFirstOrgMember: boolean | null = null;

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
            @sl-change=${(e: SlChangeEvent) => {
              const select = e.target as SlSelect | null;
              const org = select?.value
                ? this.orgs?.find(({ id }) => id === select.value)
                : null;

              if (org?.users) {
                this.isFirstOrgMember = Object.keys(org.users).length === 0;
              } else {
                this.isFirstOrgMember = null;
              }
            }}
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
            required
            ?disabled=${this.isFirstOrgMember === null}
          >
            <sl-option value=${AccessCode.owner}>
              ${"Admin"}
              ${this.isFirstOrgMember
                ? html`<span slot="suffix">
                    ${msg("Required for first member")}
                  </span>`
                : nothing}
            </sl-option>
            <sl-option
              value=${AccessCode.crawler}
              ?disabled=${this.isFirstOrgMember}
            >
              ${"Crawler"}
            </sl-option>
            <sl-option
              value=${AccessCode.viewer}
              ?disabled=${this.isFirstOrgMember}
            >
              ${"Viewer"}
            </sl-option>
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
            ?disabled=${this.isFirstOrgMember === null || this.isSubmitting}
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
