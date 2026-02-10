import "./feature-flags";
import "./orgs";
import "./feature-flag-editor";

import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import needLogin from "@/decorators/needLogin";
import {
  featureFlagsMetadataSchema,
  type FeatureFlagMetadata,
} from "@/types/featureFlags";

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

  flags = new Task(this, {
    task: async () => {
      return featureFlagsMetadataSchema.parse(
        await this.api.fetch<FeatureFlagMetadata[]>("/flags/metadata"),
      );
    },
    args: () => [] as const,
  });

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
          ${when(
            this.flags.value?.length || this.page === "adminFeatureFlags",
            () =>
              html`<btrix-tab-group-tab slot="nav" panel="adminFeatureFlags"
                >${msg("Feature Flags")}</btrix-tab-group-tab
              >`,
          )}

          <btrix-tab-group-panel name="adminOrgs"
            ><btrix-admin-orgs></btrix-admin-orgs
          ></btrix-tab-group-panel>
          <btrix-tab-group-panel name="adminFeatureFlags"
            ><btrix-admin-feature-flags
              .flags=${this.flags}
            ></btrix-admin-feature-flags
          ></btrix-tab-group-panel>
        </btrix-tab-group>
      </main>
    `;
  }
}
