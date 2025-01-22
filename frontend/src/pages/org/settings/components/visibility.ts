import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlSwitch } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { UPDATED_STATUS_TOAST_ID, type UpdateOrgDetail } from "../settings";

import { BtrixElement } from "@/classes/BtrixElement";
import { columns, type Cols } from "@/layouts/columns";
import { RouteNamespace } from "@/routes";
import { alerts } from "@/strings/orgs/alerts";

/**
 * @fires btrix-update-org
 */
@localized()
@customElement("btrix-org-settings-visibility")
export class OrgSettingsVisibility extends BtrixElement {
  render() {
    const orgBaseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;

    const cols: Cols = [
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
    ];

    return html`
      <h2 class="mb-2 mt-7 text-lg font-medium">${msg("Visibility")}</h2>

      <section class="rounded-lg border">
        <sl-switch
          .helpText=${msg(
            "Anyone on the Internet will be able to view basic org information and browse this org's public collections.",
          )}
          @sl-change=${this.onVisibilityChange}
          ?checked=${this.org?.enablePublicProfile}
          ?disabled=${!this.org}
          class="mt-4 block px-5 pb-5 part-[label]:-order-1 part-[label]:me-2 part-[label]:ms-0 part-[base]:flex part-[form-control-help-text]:max-w-prose part-[label]:flex-grow"
          >${msg("Allow anyone to view org")}</sl-switch
        >
        <div class="px-5 pb-5">${columns(cols)}</div>
      </section>
    `;
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
        message: msg("Updated org visibility."),
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
}
