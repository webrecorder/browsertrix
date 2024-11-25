import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlRadioGroup } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { columns, type Cols } from "@/layouts/columns";

@localized()
@customElement("btrix-org-settings-privacy")
export class OrgSettingsPrivacy extends BtrixElement {
  @state()
  enablePublicProfile?: boolean;

  protected willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ): void {
    if (changedProperties.has("appState.org") && this.org) {
      if (this.enablePublicProfile === undefined) {
        this.enablePublicProfile = this.org.enablePublicProfile;
      }
    }
  }

  render() {
    const orgHomeUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}/orgs/${this.orgSlug}`;

    const cols: Cols = [
      [
        html`
          <sl-radio-group
            label=${msg("Org Visibility")}
            value=${this.org?.enablePublicProfile ? "public" : "private"}
            size="small"
            @sl-change=${async (e: SlChangeEvent) => {
              this.enablePublicProfile =
                (e.target as SlRadioGroup).value === "public";
              await this.updateComplete;
              void this.save();
            }}
          >
            <sl-radio-button value="public">${msg("Public")}</sl-radio-button>
            <sl-radio-button value="private">${msg("Private")}</sl-radio-button>
          </sl-radio-group>
        `,
        msg(
          "If public, anyone with the link to your org's Browsertrix URL will be able to view the org profile and public collections.",
        ),
      ],
    ];

    if (this.enablePublicProfile) {
      cols.push([
        html`
          <div class="mb-2">
            <btrix-copy-field
              label=${msg("Public Profile Page")}
              value=${orgHomeUrl}
              .monostyle=${false}
            ></btrix-copy-field>
          </div>
        `,
        html`
          ${msg(
            "To customize the URL to this page, update your Org URL in profile settings.",
          )}
          <a
            class="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600"
            href=${`${this.navigate.orgBasePath}/profile-preview`}
            target="_blank"
          >
            ${msg("Preview Public Profile")}
            <sl-icon slot="suffix" name="arrow-right"></sl-icon
          ></a>
        `,
      ]);
    }

    return html`
      <h2 class="mb-2 mt-7 text-lg font-medium">${msg("Privacy")}</h2>

      <section class="rounded-lg border">
        <div class="p-5">${columns(cols)}</div>
      </section>
    `;
  }

  private async save() {
    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/list-public-collections`,
        {
          method: "POST",
          body: JSON.stringify({
            enablePublicProfile: Boolean(this.enablePublicProfile),
          }),
        },
      );

      if (!data.updated) {
        throw new Error();
      }

      this.notify.toast({
        message: this.enablePublicProfile
          ? msg("Public Collections link is enabled.")
          : msg("Public Collections link is disabled."),
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
