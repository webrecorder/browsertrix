import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlSwitch } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { columns, type Cols } from "@/layouts/columns";

@localized()
@customElement("btrix-org-settings-privacy")
export class OrgSettingsPrivacy extends BtrixElement {
  @state()
  listPublicCollections?: boolean;

  protected willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ): void {
    if (changedProperties.has("appState.org") && this.org) {
      if (this.listPublicCollections === undefined) {
        this.listPublicCollections = this.org.listPublicCollections;
      }
    }
  }

  render() {
    const orgHomeUrl = `${window.location.protocol}//${window.location.hostname}/orgs/${this.orgSlug}`;

    const cols: Cols = [
      [
        html`
          <sl-switch
            ?checked=${this.org?.listPublicCollections}
            @sl-change=${async (e: SlChangeEvent) => {
              this.listPublicCollections = (e.target as SlSwitch).checked;
              await this.updateComplete;
              void this.save();
            }}
            >${msg("Enable Public Collections Link")}</sl-switch
          >
        `,
        msg(
          "Create a link that anyone can visit to view all public collections in the org.",
        ),
      ],
    ];

    if (this.listPublicCollections) {
      cols.push([
        html`
          <div class="mb-2">
            <btrix-copy-field
              label=${msg("Shareable Link")}
              value=${orgHomeUrl}
              .monostyle=${false}
            ></btrix-copy-field>
            <p class="form-help-text mt-2">
              ${msg(
                "To customize this link, update your Org URL under General settings.",
              )}
            </p>
          </div>
        `,
        msg(
          "Anyone on the internet with this link will be able to view your org's public collections.",
        ),
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
            listPublicCollections: Boolean(this.listPublicCollections),
          }),
        },
      );

      if (!data.updated) {
        throw new Error();
      }

      this.notify.toast({
        message: this.listPublicCollections
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
