import "./feature-flags";
import "./orgs";
import "./feature-flag-editor";

import { localized, msg } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import needLogin from "@/decorators/needLogin";

/**
 * Browsertrix superadmin dashboard
 */
@customElement("btrix-admin")
@localized()
@needLogin
export class Admin extends BtrixElement {
  @property()
  page?: "admin" | "adminOrgs" | "adminFeatureFlags" = "admin";

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("page")) {
      if (this.page === "admin") {
        this.navigate.to("/admin/orgs");
      }
    }
  }

  render() {
    if (!this.userInfo?.isSuperAdmin) {
      return;
    }

    return html`
      <btrix-document-title
        title=${msg("Dashboard – Admin")}
      ></btrix-document-title>

      <div class="bg-white">
        <header
          class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4 md:py-8"
        >
          <h1 class="text-xl font-medium">${msg("Welcome")}</h1>
        </header>
        <hr />
      </div>

      <main class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4">
        <btrix-tab-group
          active=${this.page ?? "adminOrgs"}
          .scrim=${false}
          @btrix-tab-change=${(
            e: CustomEvent<"adminOrgs" | "adminFeatureFlags">,
          ) => {
            const path = {
              adminOrgs: "/admin/orgs",
              adminFeatureFlags: "/admin/feature-flags",
            }[e.detail];
            this.navigate.to(path);
          }}
        >
          <btrix-tab-group-tab slot="nav" panel="adminOrgs"
            >${msg("Organizations")}</btrix-tab-group-tab
          >
          <btrix-tab-group-tab slot="nav" panel="adminFeatureFlags"
            >${msg("Feature Flags")}</btrix-tab-group-tab
          >
          <btrix-tab-group-panel name="adminOrgs"
            ><btrix-admin-orgs></btrix-admin-orgs
          ></btrix-tab-group-panel>
          <btrix-tab-group-panel name="adminFeatureFlags"
            ><btrix-admin-feature-flags></btrix-admin-feature-flags
          ></btrix-tab-group-panel>
        </btrix-tab-group>
      </main>
    `;
  }
}
