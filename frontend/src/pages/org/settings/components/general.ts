import { localized, msg } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import isEqual from "lodash/fp/isEqual";

import { UPDATED_STATUS_TOAST_ID, type UpdateOrgDetail } from "../settings";

import { BtrixElement } from "@/classes/BtrixElement";
import type { APIUser } from "@/index";
import { columns } from "@/layouts/columns";
import { RouteNamespace } from "@/routes";
import { alerts } from "@/strings/orgs/alerts";
import { isApiError } from "@/utils/api";
import { formValidator, maxLengthValidator } from "@/utils/form";
import slugifyStrict from "@/utils/slugify";
import { AppStateService } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

type InfoParams = {
  orgName: string;
  orgSlug: string;
};

type ProfileParams = {
  enablePublicProfile: boolean;
  publicDescription: string;
  publicUrl: string;
};

/**
 * @fires btrix-update-org
 */
@localized()
@customElement("btrix-org-settings-general")
export class OrgSettingsGeneral extends BtrixElement {
  @state()
  private isSubmitting = false;

  @state()
  private slugValue = "";

  private readonly checkFormValidity = formValidator(this);
  private readonly validateOrgNameMax = maxLengthValidator(40);
  private readonly validateDescriptionMax = maxLengthValidator(150);

  private get baseUrl() {
    return `${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
  }

  private get slugPreview() {
    return this.slugValue ? slugifyStrict(this.slugValue) : this.userOrg?.slug;
  }

  render() {
    if (!this.userOrg) return;

    const baseUrl = this.baseUrl;
    const slugPreview = this.slugPreview;

    return html`<section class="rounded-lg border">
      <form @submit=${this.onSubmit}>
        <div class="p-5">
          ${columns([
            [
              html`
                <sl-input
                  class="with-max-help-text hide-required-content"
                  name="orgName"
                  size="small"
                  label=${msg("Org Name")}
                  placeholder=${msg("My Organization")}
                  autocomplete="off"
                  value=${this.userOrg.name}
                  minlength="2"
                  required
                  help-text=${this.validateOrgNameMax.helpText}
                  @sl-input=${this.validateOrgNameMax.validate}
                ></sl-input>
              `,
              msg(
                "Choose a name that represents your organization, your team, or your personal web archive.",
              ),
            ],
            [
              html`
                <sl-input
                  id="org-url"
                  class="hide-required-content mb-2 part-[input]:pl-px"
                  name="orgSlug"
                  size="small"
                  label=${msg("Org URL")}
                  placeholder="my-organization"
                  autocomplete="off"
                  value=${this.orgSlugState || ""}
                  minlength="2"
                  maxlength="30"
                  required
                  @sl-input=${this.handleSlugInput}
                >
                  <div slot="prefix" class="font-light text-neutral-500">
                    ${baseUrl}/
                  </div>
                  <div slot="help-text" class="leading-relaxed">
                    ${msg("Examples of org URL in use")}:
                    <ul class="list-inside list-disc">
                      <li>
                        ${msg("Settings")} ${msg("(current page)")}:
                        <span class="break-word text-blue-500">
                          /${RouteNamespace.PrivateOrgs}/<strong
                            class="font-medium"
                            >${slugPreview}</strong
                          >/settings
                        </span>
                      </li>

                      ${this.org?.enablePublicProfile
                        ? html`
                            <li>
                              ${msg("Public collections gallery")}:
                              <span class="break-word text-blue-500">
                                /${RouteNamespace.PublicOrgs}/<strong
                                  class="font-medium"
                                  >${slugPreview}</strong
                                >
                              </span>
                            </li>
                          `
                        : html`
                            <li>
                              ${msg("Dashboard")}:
                              <span class="break-word text-blue-500">
                                /${RouteNamespace.PrivateOrgs}/<strong
                                  class="font-medium"
                                  >${slugPreview}</strong
                                >/dashboard
                              </span>
                            </li>
                          `}
                    </ul>
                  </div>
                </sl-input>
              `,
              msg("Customize your org's Browsertrix URL."),
            ],
          ])}

          <div class="mt-5">${this.renderPublicGallerySettings()}</div>
        </div>
        <footer class="flex items-center justify-end gap-2 border-t px-4 py-3">
          ${when(
            this.org?.enablePublicProfile,
            () => html`
              <btrix-link
                class="mr-auto"
                href=${`/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`}
                target="_blank"
              >
                ${msg("View public collections gallery")}
              </btrix-link>
            `,
          )}
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Save")}
          </sl-button>
        </footer>
      </form>
    </section>`;
  }

  private renderPublicGallerySettings() {
    const baseUrl = this.baseUrl;
    const slugPreview = this.slugPreview;
    const publicGalleryUrl = `${window.location.protocol}//${baseUrl}/${RouteNamespace.PublicOrgs}/${slugPreview}`;

    return html`
      <btrix-section-heading class="[--margin:var(--sl-spacing-medium)]">
        ${msg("Public Collections Gallery")}
      </btrix-section-heading>
      ${columns([
        [
          html`
            <div class="mb-4">
              <sl-switch
                id="orgVisibility"
                name="enablePublicProfile"
                size="small"
                ?checked=${this.org?.enablePublicProfile}
                ?disabled=${!this.org}
              >
                ${msg("Enable public collections gallery")}
              </sl-switch>
            </div>
            <btrix-copy-field
              aria-label=${msg("Public collections gallery URL")}
              value=${publicGalleryUrl}
              .monostyle=${false}
            >
              <sl-tooltip slot="prefix" content=${msg("Open in New Tab")} hoist>
                <sl-icon-button
                  href=${publicGalleryUrl}
                  name="box-arrow-up-right"
                  target="_blank"
                  class="my-x ml-px border-r"
                >
                </sl-icon-button>
              </sl-tooltip>
            </btrix-copy-field>
          `,
          msg(
            "If enabled, anyone on the Internet will be able to visit this URL to browse public collections and view general org information.",
          ),
        ],
        [
          html`
            <sl-textarea
              class="with-max-help-text mt-5"
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
            "Write a short description that introduces your org and its public collections.",
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
      ])}
    `;
  }

  private handleSlugInput(e: InputEvent) {
    const input = e.target as SlInput;
    // Ideally this would match against the full character map that slugify uses
    // but this'll do for most use cases
    const end = input.value.match(/[\s*_+~.,()'"!\-:@]$/g) ? "-" : "";
    input.value = slugifyStrict(input.value) + end;
    this.slugValue = slugifyStrict(input.value);

    input.setCustomValidity(
      this.slugValue.length < 2 ? msg("URL too short") : "",
    );
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl)) || !this.org) return;

    const {
      orgName,
      orgSlug,
      publicDescription,
      publicUrl,
      enablePublicProfile,
    } = serialize(formEl) as InfoParams &
      ProfileParams & {
        enablePublicProfile: undefined | "on";
      };

    // TODO See if backend can combine into one endpoint
    const requests: Promise<unknown>[] = [];

    const infoParams = {
      name: orgName,
      slug: this.slugValue ? slugifyStrict(this.slugValue) : orgSlug,
    };
    const infoChanged = !isEqual(infoParams)({
      name: this.org.name,
      slug: this.org.slug,
    });

    if (infoChanged) {
      requests.push(this.renameOrg(infoParams));
    }

    const profileParams: ProfileParams = {
      enablePublicProfile: enablePublicProfile === "on",
      publicDescription,
      publicUrl,
    };
    const profileChanged = !isEqual(profileParams, {
      enablePublicProfile: this.org.enablePublicProfile,
      publicDescription: this.org.publicDescription,
      publicUrl: this.org.publicUrl,
    });

    if (profileChanged) {
      requests.push(this.updateProfile(profileParams));
    }

    this.isSubmitting = true;

    try {
      await Promise.all(requests);

      this.notify.toast({
        message: alerts.settingsUpdateSuccess,
        variant: "success",
        icon: "check2-circle",
        id: UPDATED_STATUS_TOAST_ID,
      });
    } catch (err) {
      console.debug(err);

      let message = alerts.settingsUpdateFailure;

      if (isApiError(err)) {
        if (err.details === "duplicate_org_name") {
          message = msg("This org name is already taken, try another one.");
        } else if (err.details === "duplicate_org_slug") {
          message = msg("This org URL is already taken, try another one.");
        } else if (err.details === "invalid_slug") {
          message = msg(
            "This org URL is invalid. Please use alphanumeric characters and dashes (-) only.",
          );
        }
      }

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: UPDATED_STATUS_TOAST_ID,
      });
    }

    this.isSubmitting = false;
  }

  private async renameOrg({ name, slug }: { name: string; slug: string }) {
    await this.api.fetch(`/orgs/${this.orgId}/rename`, {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });

    const user = await this.getCurrentUser();

    AppStateService.updateUser(formatAPIUser(user), slug);

    await this.updateComplete;

    this.navigate.to(`${this.navigate.orgBasePath}/settings`);
  }

  private async updateProfile({
    enablePublicProfile,
    publicDescription,
    publicUrl,
  }: ProfileParams) {
    const data = await this.api.fetch<{ updated: boolean }>(
      `/orgs/${this.orgId}/public-profile`,
      {
        method: "POST",
        body: JSON.stringify({
          enablePublicProfile,
          publicDescription,
          publicUrl,
        }),
      },
    );

    if (!data.updated) {
      throw new Error("`data.updated` is not true");
    }

    this.dispatchEvent(
      new CustomEvent<UpdateOrgDetail>("btrix-update-org", {
        detail: {
          publicDescription,
          publicUrl,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async getCurrentUser(): Promise<APIUser> {
    return this.api.fetch("/users/me");
  }
}
