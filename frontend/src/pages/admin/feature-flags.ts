import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";

import { BtrixElement } from "@/classes/BtrixElement";
import needLogin from "@/decorators/needLogin";
import { type APIPaginatedList } from "@/types/api";
import { type OrgData } from "@/types/org";

export type FlagMetadata = {
  name: string;
  description: string;
  count: number;
};

/**
 * Browsertrix superadmin dashboard
 */
@customElement("btrix-admin-feature-flags")
@localized()
@needLogin
export class AdminOrgs extends BtrixElement {
  flags = new Task(this, {
    task: async () => {
      return await this.api.fetch<FlagMetadata[]>("/flags/metadata");
    },
    args: () => [] as const,
  });

  orgs = new Task(this, {
    task: async () => {
      return await this.api.fetch<APIPaginatedList<OrgData>>(
        "/orgs?sortBy=name",
      );
    },
    args: () => [] as const,
  });

  render() {
    return html`
      <btrix-document-title
        title=${msg("Dashboard – Admin")}
      ></btrix-document-title>

      <main class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4">
        ${this.renderFlags()}
      </main>
    `;
  }
  renderFlags() {
    return html`
      <div @btrix-feature-flag-updated=${this.updateOrgsAndFlags}>
        ${this.flags.value?.map((flag) => {
          const availableOrgs = this.orgs.value?.items.filter(
            (org) => !org.featureFlags[flag.name],
          );
          return keyed(
            flag.name,
            html`
              <btrix-feature-flag-editor
                .feature=${flag}
                .availableOrgs=${availableOrgs}
              ></btrix-feature-flag-editor>
            `,
          );
        })}
      </div>
    `;
  }

  private readonly updateOrgsAndFlags = () => {
    void this.orgs.run([]);
    void this.flags.run([]);
  };
}
