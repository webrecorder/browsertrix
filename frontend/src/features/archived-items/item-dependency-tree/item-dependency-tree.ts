import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlTree, SlTreeItem } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, unsafeCSS } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";
import queryString from "query-string";

import stylesheet from "./item-dependency-tree.stylesheet.css";

import { BtrixElement } from "@/classes/BtrixElement";
import { dedupeIconFor } from "@/features/collections/dedupe-badge";
import type { ArchivedItemSectionName } from "@/pages/org/archived-item-detail/archived-item-detail";
import { OrgTab, WorkflowTab } from "@/routes";
import { noData } from "@/strings/ui";
import type { APIPaginatedList } from "@/types/api";
import type { Crawl } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const styles = unsafeCSS(stylesheet);

// FIXME Sometimes the API returns circular dependencies
const dependenciesWithoutSelf = (item: Crawl) =>
  item.requiresCrawls.filter((id) => id !== item.id);

@customElement("btrix-item-dependency-tree")
@localized()
export class ItemDependencyTree extends BtrixElement {
  static styles = styles;

  @property({ type: String })
  collectionId?: string;

  @property({ type: Array })
  items?: Crawl[];

  @property({ type: Boolean })
  showHeader = false;

  @query("sl-tree")
  private readonly tree?: SlTree | null;

  private readonly timerIds: number[] = [];

  private readonly dependenciesMap = new Map<
    string,
    Crawl | Promise<Crawl | undefined>
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

      const query = queryString.stringify(
        {
          ids: newIds,
        },
        {
          arrayFormat: "none",
        },
      );

      const request = this.api.fetch<APIPaginatedList<Crawl>>(
        `/orgs/${this.orgId}/crawls?${query}`,
        { signal },
      );

      newIds.forEach((id) => {
        this.dependenciesMap.set(
          id,
          request.then(({ items }) => items.find((item) => item.id === id)),
        );
      });

      return request;
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
            <div>${msg("Date Started")}</div>
            <div>${msg("Date Finished")}</div>
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
      >
        ${repeat(this.items, ({ id }) => id, this.renderItem)}
      </sl-tree>
    `;
  }

  private readonly renderItem = (item: Crawl) => {
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
        <sl-tooltip content=${msg("Missing Dependency")} hoist>
          <sl-icon
            name="question-diamond"
            class="text-base text-warning"
          ></sl-icon>
        </sl-tooltip>
        <div class="font-monostyle text-xs text-neutral-600">
          ${msg("Missing item with ID")} <code>${id}</code>
        </div>
      </div>
    `;
    const item = this.dependenciesMap.get(id);

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
      ${item
        ? until(
            Promise.resolve(item).then((item) =>
              item ? this.renderContent(item) : noItem(),
            ),
            skeleton(),
          )
        : skeleton()}
    </sl-tree-item>`;
  };

  private readonly renderContent = (item: Crawl) => {
    const dependencies = dependenciesWithoutSelf(item);
    const collectionId = this.collectionId;
    const inCollection = collectionId
      ? item.collectionIds.includes(collectionId)
      : item.dedupeCollId && item.collectionIds.includes(item.dedupeCollId);

    const status = () => {
      let icon = "dash-circle";
      let variant = tw`text-neutral-400`;
      let tooltip = msg("Not in Collection");

      if (inCollection) {
        icon = "check-circle";
        variant = tw`text-cyan-500`;

        if (collectionId) {
          tooltip = msg("In Same Collection");
        } else {
          tooltip = msg("In Collection");
        }
      }

      return html`<sl-tooltip content=${tooltip} hoist placement="left">
        <sl-icon name=${icon} class=${clsx(variant, tw`text-base`)}></sl-icon>
      </sl-tooltip>`;
    };

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
      ${status()}
      <div class="component--detail">${renderName(item)}</div>
      <div class="component--detail">
        <sl-tooltip content=${msg("Dedupe Dependencies")} hoist>
          <sl-icon name=${dedupeIconFor.dependent}></sl-icon>
        </sl-tooltip>
        <span
          >${this.localize.number(dependencies.length)}
          ${pluralOf(
            this.showHeader ? "items" : "dependencies",
            dependencies.length,
          )}</span
        >
      </div>
      <div class="component--detail">
        <sl-tooltip content=${msg("Date Started")} hoist>
          <sl-icon name="hourglass-top"></sl-icon>
        </sl-tooltip>
        ${date(item.started)}
      </div>
      <div class="component--detail">
        <sl-tooltip content=${msg("Date Finished")} hoist>
          <sl-icon name="hourglass-bottom"></sl-icon>
        </sl-tooltip>
        ${item.finished ? date(item.finished) : noData}
      </div>
      <div class="component--detail flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("Size")} hoist>
          <sl-icon name="file-earmark-binary"></sl-icon>
        </sl-tooltip>
        ${this.localize.bytes(item.fileSize || 0, { unitDisplay: "short" })}
      </div>
      ${this.renderLink(
        `${this.navigate.orgBasePath}/${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}#${"overview" as ArchivedItemSectionName}`,
      )}
    </div>`;
  };

  private renderLink(href: string) {
    return html`<sl-icon-button
      name="link"
      href=${href}
      label=${msg("Visit Link")}
      @click=${this.navigate.link}
    >
    </sl-icon-button>`;
  }
}
