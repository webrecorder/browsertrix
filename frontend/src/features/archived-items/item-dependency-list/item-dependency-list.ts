import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, nothing, unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import queryString from "query-string";

import { collectionStatusIcon } from "../templates/collection-status-icon";

import stylesheet from "./item-dependency-list.stylesheet.css";

import { BtrixElement } from "@/classes/BtrixElement";
import { dedupeIcon } from "@/features/collections/templates/dedupe-icon";
import { dedupeStatusText } from "@/features/collections/templates/dedupe-status-text";
import type { ArchivedItemSectionName } from "@/pages/org/archived-item-detail/archived-item-detail";
import { OrgTab, WorkflowTab } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import type { ArchivedItem } from "@/types/crawler";
import { isCrawl, renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";

const styles = unsafeCSS(stylesheet);

// FIXME Sometimes the API returns circular dependencies
const dependenciesWithoutSelf = (item: ArchivedItem) =>
  item.requiresCrawls.filter((id) => id !== item.id);

@customElement("btrix-item-dependency-list")
@localized()
export class ItemDependencyList extends BtrixElement {
  static styles = styles;

  @property({ type: String })
  collectionId?: string;

  @property({ type: Array })
  items?: ArchivedItem[];

  private readonly timerIds: number[] = [];

  private readonly dependenciesMap = new Map<
    string,
    ArchivedItem | undefined
  >();

  private readonly dependenciesTask = new Task(this, {
    task: async ([items], { signal }) => {
      if (!items?.length) return;

      const itemsMap = new Map(items.map((item) => [item.id, item]));
      const newIds: string[] = [];

      items.forEach((item) => {
        dependenciesWithoutSelf(item).forEach((id) => {
          if (!this.dependenciesMap.get(id)) {
            const cachedItem = itemsMap.get(id);
            if (cachedItem) {
              this.dependenciesMap.set(id, cachedItem);
            } else {
              newIds.push(id);
            }
          }
        });
      });

      if (!newIds.length) return;

      const query = queryString.stringify(
        {
          ids: newIds,
        },
        {
          arrayFormat: "none",
        },
      );

      const { items: dependencies } = await this.api.fetch<
        APIPaginatedList<ArchivedItem>
      >(`/orgs/${this.orgId}/all-crawls?${query}`, { signal });

      newIds.forEach((id) => {
        this.dependenciesMap.set(
          id,
          dependencies.find((item) => item.id === id),
        );
      });
    },
    args: () => [this.items] as const,
  });

  disconnectedCallback(): void {
    this.timerIds.forEach(window.clearTimeout);
    super.disconnectedCallback();
  }

  render() {
    if (!this.items?.length) return;

    return html`
      <btrix-table
        style="--btrix-table-grid-template-columns: ${[
          "[clickable-start] min-content",
          "repeat(4, auto) [clickable-end]",
          "min-content",
        ].join(" ")}"
      >
        <btrix-table-head
          class="mb-2 [--btrix-table-cell-padding-x:var(--sl-spacing-x-small)]"
        >
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Status")}</span>
          </btrix-table-header-cell>
          <btrix-table-header-cell class="pl-0"
            >${msg("Name")}</btrix-table-header-cell
          >
          <btrix-table-header-cell>
            ${msg("Dependencies")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Date")}</btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Size")}</btrix-table-header-cell>
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body
          class="divide-y overflow-clip rounded border [--btrix-table-cell-padding-x:var(--sl-spacing-x-small)] [--btrix-table-cell-padding-y:var(--sl-spacing-2x-small)]"
        >
          ${repeat(this.items, ({ id }) => id, this.renderItem)}
        </btrix-table-body>
      </btrix-table>
    `;
  }

  private readonly renderItem = (item: ArchivedItem) => {
    return html`
      <btrix-table-row
        id=${item.id}
        class="h-10 cursor-pointer select-none whitespace-nowrap transition-colors duration-fast focus-within:bg-neutral-50 hover:bg-neutral-50"
      >
        ${this.renderContent(item)}
      </btrix-table-row>
    `;
  };

  private readonly renderContent = (item: ArchivedItem) => {
    const dependencies = dependenciesWithoutSelf(item);
    const crawled = isCrawl(item);
    const collectionId = this.collectionId;

    const date = (value: string) =>
      this.localize.date(value, {
        month: "2-digit",
        year: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

    return html`

      <btrix-table-cell>
        ${collectionStatusIcon({ item, collectionId })}
      </btrix-table-cell>
      <btrix-table-cell class="pl-0" rowClickTarget="a">
        <a class=""
          href=${
            crawled
              ? `${this.navigate.orgBasePath}/${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}#${"dependencies" as ArchivedItemSectionName}`
              : `${this.navigate.orgBasePath}/${OrgTab.Items}/${item.type}/${item.id}#${"dependencies" as ArchivedItemSectionName}`
          }
    @click=${this.navigate.link}
        >
          ${renderName(item)}
        </a>
      </btrix-table-cell>
      <btrix-table-cell class="flex items-center gap-1.5 truncate tabular-nums">
        <sl-tooltip
          content=${dedupeStatusText(
            item.requiredByCrawls.length,
            dependencies.length,
          )}
          placement="left"
          hoist
        >
        ${
          dependencies.length
            ? html`
                ${dedupeIcon({
                  hasDependencies: true,
                  hasDependents: !!item.requiredByCrawls.length,
                })}
                ${this.localize.number(dependencies.length)}
                ${pluralOf("dependencies", dependencies.length)}
              `
            : nothing
        }
        </sl-tooltip>
      </btrix-table-cell>

      <btrix-table-cell class="flex items-center gap-1.5 truncate tabular-nums">
        ${
          crawled
            ? html`<sl-tooltip
                content=${msg("Date Finished")}
                placement="left"
                hoist
              >
                ${item.finished
                  ? html`<sl-icon name="gear-wide-connected"></sl-icon> ${date(
                        item.finished,
                      )}`
                  : html`<sl-icon name="play"></sl-icon> ${date(item.started)}`}
              </sl-tooltip>`
            : html`<sl-tooltip
                content=${msg("Date Uploaded")}
                placement="left"
                hoist
              >
                <sl-icon name="upload"></sl-icon>
                ${date(item.started)}
              </sl-tooltip>`
        }
      </btrix-table-cell>

      <btrix-table-cell class="flex items-center gap-1.5 truncate">
        <sl-icon name="file-earmark-binary"></sl-icon>
        ${this.localize.bytes(item.fileSize || 0, { unitDisplay: "short" })}
      </btrix-table-cell>
      <btrix-table-cell>
        <btrix-overflow-dropdown>
          <sl-menu>
            <btrix-menu-item-link
              href="${
                crawled
                  ? `${this.navigate.orgBasePath}/${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}`
                  : `${this.navigate.orgBasePath}/${OrgTab.Items}/${item.type}/${item.id}`
              }"
            >
              <sl-icon slot="prefix" name=${crawled ? "gear-wide-connected" : "arrow-return-right"}></sl-icon>
              ${crawled ? msg("Go to Crawl Run") : msg("Go to Item")}
            </btrix-menu-item-link>
            <btrix-menu-item-link
              href="${
                this.navigate.orgBasePath
              }/${OrgTab.Workflows}/${item.cid}"
            >
              <sl-icon slot="prefix" name="arrow-return-right"></sl-icon>
              ${msg("Go to Workflow")}
            </btrix-menu-item-link>
          </sl-menu>
        </btrix-overflow-dropdown>
      </btrix-table-cell>
    </div>`;
  };
}
