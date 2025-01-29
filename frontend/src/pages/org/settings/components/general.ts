import { localized, msg } from "@lit/localize";
import type {
  SlChangeEvent,
  SlInput,
  SlSwitch,
} from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

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

/**
 * @fires btrix-update-org
 */
@localized()
@customElement("btrix-org-settings-general")
export class OrgSettingsGeneral extends BtrixElement {
  @state()
  private isSavingOrgName = false;

  @state()
  private slugValue = "";

  private readonly checkFormValidity = formValidator(this);
  private readonly validateOrgNameMax = maxLengthValidator(40);
  private readonly validateDescriptionMax = maxLengthValidator(150);

  render() {
    if (!this.userOrg) return;

    const baseUrl = `${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
    const slugValue = this.slugValue || this.orgSlugState;
    const publicGalleryUrl = `${window.location.protocol}//${baseUrl}/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`;

    return html`<section class="rounded-lg border">
      <form @submit=${this.onOrgInfoSubmit}>
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
                            >${slugValue}</strong
                          >/settings
                        </span>
                      </li>
                      <li>
                        ${msg("Dashboard")}:
                        <span class="break-word text-blue-500">
                          /${RouteNamespace.PrivateOrgs}/<strong
                            class="font-medium"
                            >${slugValue}</strong
                          >/dashboard
                        </span>
                      </li>
                      ${this.org?.enablePublicProfile
                        ? html`
                            <li>
                              ${msg("Public gallery")}:
                              <span class="break-word text-blue-500">
                                /${RouteNamespace.PublicOrgs}/<strong
                                  class="font-medium"
                                  >${slugValue}</strong
                                >
                              </span>
                            </li>
                          `
                        : html``}
                    </ul>
                  </div>
                </sl-input>
              `,
              msg("Customize your org's Browsertrix URL."),
            ],
            [
              html`
                <label for="orgVisibility" class="form-label text-xs">
                  ${msg("Public Collections Gallery")}
                </label>
                <div>
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
              `,
              msg(
                "If enabled, anyone on the Internet will be able to browse this org's public collections and view general org information.",
              ),
            ],
            [
              html`
                <div class="mb-2">
                  <btrix-copy-field
                    label=${msg("Public Gallery URL")}
                    value=${publicGalleryUrl}
                    .border=${false}
                    .monostyle=${false}
                    .filled=${false}
                  >
                    <sl-tooltip
                      slot="prefix"
                      content=${msg("Open in New Tab")}
                      hoist
                    >
                      <sl-icon-button
                        href=${publicGalleryUrl}
                        name="box-arrow-up-right"
                        target="_blank"
                        class="m-px"
                      >
                      </sl-icon-button>
                    </sl-tooltip>
                  </btrix-copy-field>
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
                  label=${msg("Public Gallery Description")}
                  autocomplete="off"
                  value=${this.org?.publicDescription || ""}
                  minlength="2"
                  rows="2"
                  help-text=${this.validateDescriptionMax.helpText}
                  @sl-input=${this.validateDescriptionMax.validate}
                ></sl-textarea>
              `,
              msg(
                "Write a short description that introduces your org and public collections.",
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
              msg(
                "Link to your organization's (or your personal) website in the public gallery.",
              ),
            ],
          ])}
        </div>
        <footer class="flex items-center justify-between border-t px-4 py-3">
          <btrix-link
            href=${`/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`}
            target="_blank"
          >
            ${when(
              this.org,
              (org) =>
                org.enablePublicProfile
                  ? msg("View as public")
                  : msg("Preview how information appears to the public"),
              () => html` <sl-skeleton class="w-36"></sl-skeleton> `,
            )}
          </btrix-link>
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSavingOrgName}
            ?loading=${this.isSavingOrgName}
          >
            ${msg("Save")}
          </sl-button>
        </footer>
      </form>
    </section>`;
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

  private readonly onVisibilityChange = async (e: SlChangeEvent) => {
    const checked = (e.target as SlSwitch).checked;

    if (checked === this.org?.enablePublicProfile) {
      return;
    }

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/public-profile`,
        {
          method: "POST",
          body: JSON.stringify({
            enablePublicProfile: checked,
          }),
        },
      );

      if (!data.updated) {
        throw new Error("`data.updated` is not true");
      }

      this.dispatchEvent(
        new CustomEvent<UpdateOrgDetail>("btrix-update-org", {
          detail: {
            enablePublicProfile: checked,
          },
          bubbles: true,
          composed: true,
        }),
      );

      this.notify.toast({
        message: msg("Updated public collections gallery visibility."),
        variant: "success",
        icon: "check2-circle",
        id: UPDATED_STATUS_TOAST_ID,
      });
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: alerts.settingsUpdateFailure,
        variant: "danger",
        icon: "exclamation-octagon",
        id: UPDATED_STATUS_TOAST_ID,
      });
    }
  };

  private async onOrgInfoSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl)) || !this.org) return;

    const { orgName, publicDescription, publicUrl } = serialize(formEl) as {
      orgName: string;
      publicDescription: string;
      publicUrl: string;
    };

    // TODO See if backend can combine into one endpoint
    const requests: Promise<unknown>[] = [];

    if (orgName !== this.org.name || this.slugValue) {
      const params = {
        name: orgName,
        slug: this.orgSlugState!,
      };

      if (this.slugValue) {
        params.slug = slugifyStrict(this.slugValue);
      }

      requests.push(this.renameOrg(params));
    }

    if (
      publicDescription !== (this.org.publicDescription ?? "") ||
      publicUrl !== (this.org.publicUrl ?? "")
    ) {
      requests.push(
        this.updateOrgProfile({
          publicDescription: publicDescription || this.org.publicDescription,
          publicUrl: publicUrl || this.org.publicUrl,
        }),
      );
    }

    if (requests.length) {
      this.isSavingOrgName = true;

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

      this.isSavingOrgName = false;
    }
  }

  private async renameOrg({ name, slug }: { name: string; slug: string }) {
    await this.api.fetch(`/orgs/${this.orgId}/rename`, {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });

    const user = await this.getCurrentUser();

    AppStateService.updateUser(formatAPIUser(user), slug);

    this.navigate.to(`${this.navigate.orgBasePath}/settings`);
  }

  private async updateOrgProfile({
    publicDescription,
    publicUrl,
  }: {
    publicDescription: string | null;
    publicUrl: string | null;
  }) {
    const data = await this.api.fetch<{ updated: boolean }>(
      `/orgs/${this.orgId}/public-profile`,
      {
        method: "POST",
        body: JSON.stringify({
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
