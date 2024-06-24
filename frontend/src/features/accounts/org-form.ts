import { localized, msg, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import slugify from "slugify";

import { TailwindElement } from "@/classes/TailwindElement";
import type { AuthState } from "@/utils/AuthService";

export type OrgFormSubmitEventDetail = {
  values: {
    orgName: string;
    orgSlug: string;
  };
};

/**
 * @fires btrix-submit OrgFormSubmitEventDetail
 */
@localized()
@customElement("btrix-org-form")
export class OrgForm extends TailwindElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  name = "";

  @property({ type: String })
  slug = "";

  @state()
  private isSubmitting = false;

  render() {
    const helpText = (slug: unknown) =>
      msg(
        str`Your org home page will be
        ${window.location.protocol}//${window.location.hostname}/orgs/${slug || ""}`,
      );

    return html`
      <form @submit=${this.onSubmit}>
        <div class="mb-5">
          <sl-input
            name="orgName"
            label=${msg("Name of your organization")}
            placeholder=${msg("My Organization")}
            autocomplete="off"
            value=${this.name}
            minlength="2"
            maxlength="40"
            help-text=${msg("You can change this in your org settings later.")}
            required
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
            value=${this.slug}
            minlength="2"
            maxlength="30"
            help-text=${helpText(this.slug)}
            required
            @sl-input=${(e: InputEvent) => {
              const input = e.target as SlInput;
              input.helpText = helpText(slugify(input.value, { strict: true }));
            }}
          >
          </sl-input>
        </div>
        <sl-button
          class="w-full"
          variant="primary"
          type="submit"
          ?loading=${this.isSubmitting}
        >
          ${msg("Go to Dashboard")}
        </sl-button>
      </form>
    `;
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(form))) return;

    const params = serialize(form) as OrgFormSubmitEventDetail["values"];

    this.isSubmitting = true;

    this.dispatchEvent(
      new CustomEvent<OrgFormSubmitEventDetail>("btrix-submit", {
        detail: {
          values: params,
        },
      }),
    );
  }

  private async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
