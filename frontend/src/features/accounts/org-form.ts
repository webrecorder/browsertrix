import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import slugify from "slugify";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import { isApiError } from "@/utils/api";
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
  orgId?: string;

  @property({ type: String })
  name = "";

  @property({ type: String })
  slug = "";

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

  private readonly renameOrgTask = new Task(this, {
    autoRun: false,
    task: async ([id, name, slug]) => {
      if (!id) throw new Error("Missing args");
      const inviteInfo = await this.renameOrg(id, { name, slug });
      return inviteInfo;
    },
    args: () => [this.orgId, this.name, this.slug] as const,
  });

  render() {
    const helpText = (slug: unknown) =>
      msg(
        str`Your org dashboard will be
        ${window.location.protocol}//${window.location.hostname}/orgs/${slug || ""}`,
      );

    return html`
      <form @submit=${this.onSubmit} aria-describedby="formError">
        <div class="mb-5">
          <sl-input
            name="orgName"
            label=${msg("Org name")}
            placeholder=${msg("My Organization")}
            autocomplete="off"
            value=${this.name === this.orgId ? "" : this.name}
            minlength="2"
            maxlength="40"
            help-text=${msg("You can change this in your org settings later.")}
            required
          ></sl-input>
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
        ${this.renameOrgTask.render({
          error: (err) =>
            html`<div class="my-5">
              <btrix-alert id="formError" variant="danger"
                >${err instanceof Error ? err.message : err}</btrix-alert
              >
            </div>`,
        })}
        <sl-button
          class="w-full"
          variant="primary"
          type="submit"
          ?loading=${this.renameOrgTask.status === TaskStatus.PENDING}
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

    void this.renameOrgTask.run([this.orgId, params.orgName, params.orgSlug]);
  }

  private async renameOrg(
    id: string,
    { name, slug }: { name?: string; slug?: string },
  ) {
    try {
      await this.api.fetch(`/orgs/${id}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      this.notify.toast({
        message: msg("Org successfully updated."),
        variant: "success",
        icon: "check2-circle",
      });

      await this.dispatchEvent(
        new CustomEvent("btrix-update-user-info", { bubbles: true }),
      );
      this.navigate.to(`/orgs/${slug || this.slug}`);
    } catch (e) {
      console.debug(e);
      if (isApiError(e) && e.details === "duplicate_org_name") {
        throw new Error(
          msg("This org name or URL is already taken, try another one."),
        );
      }

      this.notify.toast({
        message: msg(
          "Sorry, couldn't rename organization at this time. Try again later from org settings.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });

      this.navigate.to(`/orgs/${this.slug}`);
    }
  }

  private async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
