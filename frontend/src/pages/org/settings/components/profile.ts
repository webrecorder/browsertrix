import { localized, msg } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { columns, type Cols } from "@/layouts/columns";
import { RouteNamespace } from "@/routes";
import { formValidator, maxLengthValidator } from "@/utils/form";

@localized()
@customElement("btrix-org-settings-profile")
export class OrgSettingsProfile extends BtrixElement {
  private readonly validateDescriptionMax = maxLengthValidator(150);

  render() {
    const orgBaseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;

    const cols: Cols = [
      [
        html`
          <label for="orgVisibility" class="form-label text-xs">
            ${msg("Org Visibility")}
          </label>
          <div>
            <sl-switch
              id="orgVisibility"
              name="enablePublicProfile"
              size="small"
              ?checked=${this.org?.enablePublicProfile}
            >
              ${msg("Allow anyone to view org")}
            </sl-switch>
          </div>
        `,
        msg(
          "If enabled, anyone will be able to view the org name, description, and public collections in the org's public page or via API.",
        ),
      ],
      [
        html`
          <div class="mb-2">
            <btrix-copy-field
              label=${msg("Public Page URL")}
              value=${`${orgBaseUrl}/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`}
              .monostyle=${false}
            ></btrix-copy-field>
          </div>
        `,
        html`
          ${msg(
            html`To customize this URL,
              <a
                href=${`${location.pathname}#org-url`}
                class="text-cyan-500 underline decoration-cyan-500/30 transition hover:text-cyan-600 hover:decoration-cyan-500/50"
                >${msg("update your Org URL in General settings")}</a
              >.`,
          )}
        `,
      ],
      [
        html`
          <sl-textarea
            class="with-max-help-text"
            name="publicDescription"
            size="small"
            label=${msg("Description")}
            autocomplete="off"
            value=${this.org?.publicDescription || ""}
            minlength="2"
            rows="2"
            help-text=${this.validateDescriptionMax.helpText}
            @sl-input=${this.validateDescriptionMax.validate}
          ></sl-textarea>
        `,
        msg(
          "Write a short description to introduce your organization to the public.",
        ),
      ],
      [
        html`
          <btrix-url-input
            class="mb-2"
            name="publicUrl"
            size="small"
            label=${msg("Website")}
            value=${this.org?.publicUrl || ""}
          ></btrix-url-input>
        `,
        msg("Link to your organization's (or your personal) website."),
      ],
    ];

    return html`
      <h2 class="mb-2 mt-7 text-lg font-medium">${msg("Visibility")}</h2>

      <section class="rounded-lg border">
        <form @submit=${this.onSubmit}>
          <div class="p-5">${columns(cols)}</div>
          <footer class="flex items-center justify-between border-t px-4 py-3">
            <btrix-link
              href=${`/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`}
              target="_blank"
            >
              ${msg("Preview public page")}
            </btrix-link>
            <sl-button type="submit" size="small" variant="primary">
              ${msg("Save")}
            </sl-button>
          </footer>
        </form>
      </section>
    `;
  }

  private readonly checkFormValidity = formValidator(this);

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;

    if (!(await this.checkFormValidity(form))) return;

    const { enablePublicProfile, publicDescription, publicUrl } =
      serialize(form);

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/public-profile`,
        {
          method: "POST",
          body: JSON.stringify({
            enablePublicProfile: enablePublicProfile === "on",
            publicDescription,
            publicUrl,
          }),
        },
      );

      if (!data.updated) {
        throw new Error();
      }

      this.notify.toast({
        message: msg("Org settings has been updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn't update org at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
