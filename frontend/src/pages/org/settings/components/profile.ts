import { localized, msg } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { columns, type Cols } from "@/layouts/columns";
import { OrgTab } from "@/routes";
import { maxLengthValidator } from "@/utils/form";

@localized()
@customElement("btrix-org-settings-profile")
export class OrgSettingsProfile extends BtrixElement {
  private readonly validateDescriptionMax = maxLengthValidator(150);

  render() {
    const orgHomeUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}/orgs/${this.orgSlug}`;

    const cols: Cols = [
      [
        html`
          <label for="orgVisibility" class="form-label text-xs">
            ${msg("Visibility")}
          </label>
          <div>
            <sl-switch
              id="orgVisibility"
              name="enablePublicProfile"
              size="small"
              ?checked=${this.org?.enablePublicProfile}
            >
              ${msg("Allow anyone to see org")}
            </sl-switch>
          </div>
        `,
        msg(
          "If enabled, anyone with the link to your org's Browsertrix URL will be able to view the profile page and public collections.",
        ),
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
          "Write a short description that introduces your organization or your web archive to the world.",
        ),
      ],
      [
        html`
          <div class="mb-2">
            <btrix-copy-field
              label=${msg("Profile Page URL")}
              value=${orgHomeUrl}
              .monostyle=${false}
            ></btrix-copy-field>
          </div>
        `,
        html`
          ${msg(
            "To customize this URL, update your Org URL in General settings.",
          )}
          <a
            class="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600"
            href=${`${this.navigate.orgBasePath}/${OrgTab.ProfilePreview}`}
            target="_blank"
          >
            ${msg("Preview public profile page")}
            <sl-icon slot="suffix" name="arrow-right"></sl-icon
          ></a>
        `,
      ],
    ];

    return html`
      <h2 class="mb-2 mt-7 text-lg font-medium">${msg("Profile")}</h2>

      <section class="rounded-lg border">
        <form @submit=${this.onSubmit}>
          <div class="p-5">${columns(cols)}</div>
          <footer class="flex justify-end border-t px-4 py-3">
            <sl-button type="submit" size="small" variant="primary"
              >${msg("Save")}</sl-button
            >
          </footer>
        </form>
      </section>
    `;
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    const { enablePublicProfile, publicDescription } = serialize(form);

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/public-profile`,
        {
          method: "POST",
          body: JSON.stringify({
            enablePublicProfile: enablePublicProfile === "on",
            publicDescription,
          }),
        },
      );

      if (!data.updated) {
        throw new Error();
      }

      this.notify.toast({
        message: msg("Org profile has been updated."),
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
