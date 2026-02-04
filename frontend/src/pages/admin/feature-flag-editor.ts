import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import clsx from "clsx";
import type Fuse from "fuse.js";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  type BtrixSearchComboboxSelectEvent,
  type SearchCombobox,
} from "@/components/ui/search-combobox";
import { type FlagMetadata } from "@/pages/admin/feature-flags";
import { type OrgData } from "@/types/org";
import { stopProp } from "@/utils/events";
import { pluralOf } from "@/utils/pluralize";

@customElement("btrix-feature-flag-editor")
@localized()
export class FeatureFlagEditor extends BtrixElement {
  @state()
  open = false;

  @property({ type: Object })
  feature?: FlagMetadata;

  @property({ type: Array })
  availableOrgs?: OrgData[];

  orgs = new Task(this, {
    task: async ([visible, feature]) => {
      if (!visible || !feature) return;
      const orgs = await this.api.fetch<OrgData[]>(`/flags/${feature}/orgs`);
      return orgs;
    },
    args: () => [this.open, this.feature?.name] as const,
  });

  @query("btrix-search-combobox")
  combobox!: SearchCombobox<OrgData>;

  constructor() {
    super();
    console.log("FeatureFlagEditor constructor", this.open);
  }

  render() {
    if (!this.feature) return html``;
    const orgCount = this.orgs.value?.length ?? this.feature.count;
    return html`<sl-details
      ?open=${this.open}
      @sl-show=${() => (this.open = true)}
      @sl-after-hide=${() => (this.open = false)}
    >
      <div slot="summary" class="w-full">
        <div class="inline-flex flex-wrap items-center gap-4">
          <h3 class="font-mono text-lg">${this.feature.name}</h3>
          <btrix-badge
            >${orgCount} ${pluralOf("organizations", orgCount)}</btrix-badge
          >
        </div>
        <p>${this.feature.description}</p>
      </div>
      <div @sl-hide=${stopProp} @sl-after-hide=${stopProp}>
        ${this.orgs.status === TaskStatus.ERROR
          ? html`<p>Error loading organizations</p>`
          : nothing}
        <h3 class="font-base mb-4 font-medium lg:text-lg">
          ${msg("Organizations")}
        </h3>
        ${this.orgs.value?.length
          ? html`<btrix-table
              class="mb-4 [--btrix-table-grid-template-columns:[clickable-start]_auto_[clickable-end]_40px]"
            >
              <btrix-table-head>
                <btrix-table-header-cell>
                  <span class="sr-only">${msg("Organization")}</span>
                </btrix-table-header-cell>
                <btrix-table-header-cell>
                  <span class="sr-only"
                    >${msg("Remove feature flag from organization")}</span
                  >
                </btrix-table-header-cell>
              </btrix-table-head>
              <btrix-table-body class="rounded border">
                ${this.orgs.value.map(
                  (org) =>
                    html`<btrix-table-row
                      class="cursor-pointer select-none border-b bg-neutral-0 transition-colors first-of-type:rounded-t last-of-type:rounded-b last-of-type:border-none focus-within:bg-neutral-50 hover:bg-neutral-50"
                    >
                      <btrix-table-cell class="p-2" rowClickTarget="a"
                        ><a
                          class=${clsx(
                            org.readOnly
                              ? "text-neutral-500"
                              : "text-neutral-900",
                            "truncate",
                          )}
                          href="/orgs/${org.slug}/dashboard"
                          @click=${this.navigate.link}
                          title=${org.name}
                        >
                          ${org.default
                            ? html`<btrix-tag class="mr-1"
                                >${msg("Default")}</btrix-tag
                              >`
                            : nothing}
                          ${org.name === org.id
                            ? html`<code class="text-neutral-400"
                                >${org.id}</code
                              >`
                            : html`${org.name}
                                <btrix-badge>${org.id}</btrix-badge>`}
                        </a></btrix-table-cell
                      >
                      <btrix-table-cell>
                        <sl-tooltip
                          content=${msg("Remove")}
                          hoist
                          placement="left"
                        >
                          <sl-icon-button
                            class="p-1 text-base hover:text-danger"
                            name="trash3"
                            @click=${() => void this.deleteOrg(org.id)}
                          ></sl-icon-button>
                        </sl-tooltip>
                      </btrix-table-cell>
                    </btrix-table-row>`,
                )}
              </btrix-table-body>
            </btrix-table>`
          : html`<div class="mb-4">
              ${msg("This flag is disabled for all organizations.")}
            </div>`}
        ${this.availableOrgs?.length
          ? html`<btrix-search-combobox
              label=${msg("Add organization")}
              .searchOptions=${this.availableOrgs}
              .searchKeys=${["name", "id", "slug"]}
              .minSearchLength=${0}
              .renderResult=${(result: Fuse.FuseResult<OrgData>) => {
                const org = result.item;
                return html`<sl-menu-item slot="menu-item" value=${org.id}>
                  ${org.name} <btrix-badge>${org.id}</btrix-badge>
                </sl-menu-item>`;
              }}
              showResultsWhenEmpty
              @btrix-select=${(e: BtrixSearchComboboxSelectEvent) => {
                void this.selectOrg(e);
              }}
            ></btrix-search-combobox>`
          : msg("This flag is enabled for all organizations.")}
      </div>
    </sl-details>`;
  }
  async deleteOrg(oid: string) {
    if (!this.feature) return;
    await this.api.fetch(`/flags/${this.feature.name}/org/${oid}`, {
      method: "PATCH",
      body: JSON.stringify({ value: false }),
    });
    this.dispatchEvent(
      new CustomEvent("btrix-feature-flag-updated", {
        detail: this.feature.name,
        composed: true,
        bubbles: true,
      }),
    );
    void this.orgs.run();
  }
  async selectOrg(event: BtrixSearchComboboxSelectEvent) {
    if (!this.feature) return;
    const orgId = event.detail.item.value;
    await this.api.fetch(`/flags/${this.feature.name}/org/${orgId}`, {
      method: "PATCH",
      body: JSON.stringify({ value: true }),
    });
    this.combobox.searchByValue = "";
    this.dispatchEvent(
      new CustomEvent("btrix-feature-flag-updated", {
        detail: this.feature.name,
        composed: true,
        bubbles: true,
      }),
    );
    void this.orgs.run();
  }
}
