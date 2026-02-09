import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlTree, SlTreeItem } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, unsafeCSS } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";
import queryString from "query-string";

import { collectionStatusIcon } from "../templates/collection-status-icon";

import stylesheet from "./item-dependency-tree.stylesheet.css";

import { BtrixElement } from "@/classes/BtrixElement";
import { dedupeIcon } from "@/features/collections/templates/dedupe-icon";
import type { ArchivedItemSectionName } from "@/pages/org/archived-item-detail/archived-item-detail";
import { OrgTab, WorkflowTab } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import type { ArchivedItem } from "@/types/crawler";
import { isCrawl, renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const styles = unsafeCSS(stylesheet);

// FIXME Sometimes the API returns circular dependencies
const dependenciesWithoutSelf = (item: ArchivedItem) =>
  item.requiresCrawls.filter((id) => id !== item.id);

/**
 * @cssPart tree
 */
@customElement("btrix-item-dependency-tree")
@localized()
export class ItemDependencyTree extends BtrixElement {
  static styles = styles;

  @property({ type: String })
  collectionId?: string;

  @property({ type: Array })
  items?: ArchivedItem[];

  @property({ type: Boolean })
  showHeader = false;

  @query("sl-tree")
  private readonly tree?: SlTree | null;

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
      ${this.showHeader
        ? html`<div
            class="component--row mb-2 pl-8 text-xs leading-none text-neutral-700"
          >
            <div>
              <span class="sr-only">${msg("Status")}</span>
            </div>
            <div>${msg("Name")}</div>
            <div>${msg("Dependencies")}</div>
            <div>${msg("Date Created")}</div>
            <div>${msg("Size")}</div>
            <div>
              <span class="sr-only">${msg("Actions")}</span>
            </div>
          </div>`
        : nothing}
      <sl-tree
        class=${clsx(
          tw`divide-y overflow-hidden`,
          this.showHeader && tw`rounded border`,
        )}
        selection="leaf"
        part="tree"
      >
        ${repeat(this.items, ({ id }) => id, this.renderItem)}
      </sl-tree>
    `;
  }

  private readonly renderItem = (item: ArchivedItem) => {
    const dependencies = dependenciesWithoutSelf(item);
    const hasDependencies = dependencies.length;

    return html`
      <sl-tree-item
        id=${item.id}
        class=${clsx(
          !hasDependencies &&
            tw`transition-colors duration-slow part-[base]:cursor-default`,
        )}
      >
        ${this.renderContent(item)}
        ${hasDependencies ? dependencies.map(this.renderDependency) : nothing}
      </sl-tree-item>
    `;
  };

  private readonly renderDependency = (id: string) => {
    const skeleton = () => html`
      <div class="component--row">
        <div>
          <sl-skeleton class="w-4" effect="sheen"></sl-skeleton>
        </div>
        <div>
          <sl-skeleton class="w-[24ch]" effect="sheen"></sl-skeleton>
        </div>
        <div>
          <sl-skeleton class="w-[24ch]" effect="sheen"></sl-skeleton>
        </div>
        <div>
          <sl-skeleton class="w-[12ch]" effect="sheen"></sl-skeleton>
        </div>
        <div>
          <sl-skeleton class="w-[6ch]" effect="sheen"></sl-skeleton>
        </div>
        <div>
          <sl-skeleton class="w-4" effect="sheen"></sl-skeleton>
        </div>
      </div>
    `;
    const noItem = () => html`
      <div class="inline-flex h-9 w-full items-center gap-2">
        <sl-tooltip content=${msg("Deleted from Org")} hoist>
          <sl-icon
            name="slash-circle"
            class="text-base text-neutral-600"
          ></sl-icon>
        </sl-tooltip>
        <div class="font-monostyle text-neutral-400">
          (${msg("deleted item")})
        </div>
      </div>
    `;

    return html`<sl-tree-item
      class="component--dependency"
      @click=${() => {
        const item = this.tree?.querySelector<SlTreeItem>(`#${id}`);

        if (item) {
          item.scrollIntoView({ behavior: "smooth" });
          item.focus();
        }
      }}
    >
      ${until(
        this.dependenciesTask.taskComplete
          .then(() => this.dependenciesMap.get(id))
          .then((item) => (item ? this.renderContent(item) : noItem())),
        skeleton(),
      )}
    </sl-tree-item>`;
  };

  private readonly renderContent = (item: ArchivedItem) => {
    const dependencies = dependenciesWithoutSelf(item);
    const crawled = isCrawl(item);
    const collectionId = this.collectionId;
    const inCollection =
      collectionId && item.collectionIds.includes(collectionId);

    const date = (value: string) =>
      this.localize.date(value, {
        month: "2-digit",
        year: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

    return html`<div
      class=${clsx(
        "component--row component--content",
        !inCollection && "component--notInCollection",
        this.showHeader && "component--withHeader",
      )}
    >
      ${collectionStatusIcon({ item, collectionId })}
      <div class="component--detail">${renderName(item)}</div>

      <sl-tooltip content=${msg("Dependencies")} hoist placement="left">
        <div class="component--detail">
          ${this.showHeader
            ? this.localize.number(dependencies.length)
            : dependencies.length
              ? html`
                  ${dedupeIcon({ hasDependencies: true, hasDependents: true })}
                  ${this.localize.number(dependencies.length)}
                  ${pluralOf("dependencies", dependencies.length)}
                `
              : nothing}
        </div>
      </sl-tooltip>

      ${crawled
        ? html`<sl-tooltip
            content=${msg("Date Finished")}
            placement="left"
            hoist
          >
            <div class="component--detail">
              ${item.finished
                ? html`<sl-icon name="gear-wide-connected"></sl-icon> ${date(
                      item.finished,
                    )}`
                : html`<sl-icon name="play"></sl-icon> ${date(item.started)}`}
            </div>
          </sl-tooltip>`
        : html`<sl-tooltip
            content=${msg("Date Uploaded")}
            placement="left"
            hoist
          >
            <div class="component--detail">
              <sl-icon name="upload"></sl-icon>
              ${date(item.started)}
            </div>
          </sl-tooltip>`}

      <sl-tooltip content=${msg("Size")} hoist placement="left">
        <div class="component--detail flex items-center gap-1.5 truncate">
          <sl-icon name="file-earmark-binary"></sl-icon>
          ${this.localize.bytes(item.fileSize || 0, { unitDisplay: "short" })}
        </div>
      </sl-tooltip>

      ${this.renderLink(
        crawled
          ? `${this.navigate.orgBasePath}/${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}#${"overview" as ArchivedItemSectionName}`
          : `${this.navigate.orgBasePath}/${OrgTab.Items}/${item.type}/${item.id}`,
      )}
    </div>`;
  };

  private renderLink(href: string) {
    return html`<sl-icon-button
      name="link"
      href=${href}
      label=${msg("Link")}
      @click=${this.navigate.link}
    >
    </sl-icon-button>`;
  }
}
