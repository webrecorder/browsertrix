import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { NotifyController } from "@/controllers/notify";
import { type APIUser } from "@/index";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { maxLengthValidator } from "@/utils/form";
import slugifyStrict from "@/utils/slugify";
import { AppStateService } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

type FormValues = {
  orgName: string;
  orgSlug: string;
};

export type OrgUpdatedDetail = {
  data: { name: string; slug: string };
};

/**
 * @fires btrix-org-updated
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

  @query("#orgForm")
  private readonly form?: HTMLFormElement | null;

  readonly _api = new APIController(this);
  readonly _notify = new NotifyController(this);

  private readonly validateOrgNameMax = maxLengthValidator(40);

  readonly _renameOrgTask = new Task(this, {
    autoRun: false,
    task: async ([id, name, slug]) => {
      if (!id) throw new Error("Missing args");
      const inviteInfo = await this._renameOrg(id, { name, slug });
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
      <form id="orgForm" @submit=${this.onSubmit} aria-describedby="formError">
        <div class="mb-5">
          <sl-input
            name="orgName"
            label=${msg("Org Name")}
            placeholder=${msg("My Organization")}
            autocomplete="off"
            value=${this.name === this.orgId ? "" : this.name}
            minlength="2"
            help-text=${msg("You can change this in your org settings later.")}
            required
            @sl-input=${this.validateOrgNameMax.validate}
          ></sl-input>
        </div>
        <div class="mb-5">
          <sl-input
            name="orgSlug"
            label=${msg("Custom URL Identifier")}
            placeholder="my-organization"
            autocomplete="off"
            value=${this.slug}
            minlength="2"
            maxlength="30"
            help-text=${helpText(this.slug)}
            required
            @sl-input=${(e: InputEvent) => {
              const input = e.target as SlInput;
              input.helpText = helpText(slugifyStrict(input.value));
            }}
          >
          </sl-input>
        </div>
        ${this._renameOrgTask.render({
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
          ?loading=${this._renameOrgTask.status === TaskStatus.PENDING}
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

    const params = serialize(form) as FormValues;
    const orgName = params.orgName;
    const orgSlug = slugifyStrict(params.orgSlug);

    void this._renameOrgTask.run([this.orgId, orgName, orgSlug]);
  }

  async _renameOrg(id: string, params: { name?: string; slug?: string }) {
    const name = params.name || this.name;
    const slug = params.slug || this.slug;
    const payload = { name, slug };

    try {
      await this._api.fetch(`/orgs/${id}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      this._notify.toast({
        message: msg("Org successfully updated."),
        variant: "success",
        icon: "check2-circle",
      });

      await this.onRenameSuccess(payload);
    } catch (e) {
      console.debug(e);
      if (isApiError(e)) {
        let error: Error | null = null;
        let fieldName = "";

        if (e.details === "duplicate_org_name") {
          fieldName = "orgName";
          error = new Error(
            msg(str`The org name "${name}" is already taken, try another one.`),
          );
        } else if (e.details === "duplicate_org_slug") {
          fieldName = "orgSlug";
          error = new Error(
            msg(str`The org URL "${slug}" is already taken, try another one.`),
          );
        } else if (e.details === "invalid_slug") {
          fieldName = "orgSlug";
          error = new Error(
            msg(
              str`The org URL "${slug}" is not a valid URL. Please use alphanumeric characters and dashes (-) only`,
            ),
          );
        }

        if (error) {
          if (fieldName) {
            this.highlightErrorField(fieldName, error);
          }
          throw error;
        }
      }

      this._notify.toast({
        message: msg(
          "Sorry, couldn't rename organization at this time. Try again later from org settings.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private highlightErrorField(fieldName: string, error: Error) {
    const input = this.form?.querySelector<SlInput>(`[name="${fieldName}"]`);

    if (input) {
      input.setCustomValidity(error.message);

      const onOneInput = () => {
        input.setCustomValidity("");
        input.removeEventListener("sl-input", onOneInput);
      };
      input.addEventListener("sl-input", onOneInput);
    }
  }

  private async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  private async onRenameSuccess(data: OrgUpdatedDetail["data"]) {
    try {
      const user = await this._getCurrentUser();

      AppStateService.updateUserInfo(formatAPIUser(user));
      AppStateService.updateOrgSlug(data.slug);
    } catch (e) {
      console.debug(e);
    }

    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<OrgUpdatedDetail>("btrix-org-updated", {
        detail: { data },
      }),
    );
  }

  async _getCurrentUser(): Promise<APIUser> {
    return this._api.fetch("/users/me", this.authState!);
  }
}
