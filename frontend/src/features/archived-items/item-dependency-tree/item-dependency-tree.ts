import { localized, msg } from "@lit/localize";
import { html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";

import stylesheet from "./item-dependency-tree.stylesheet.css";

import { BtrixElement } from "@/classes/BtrixElement";
import { OrgTab, WorkflowTab } from "@/routes";
import { noData } from "@/strings/ui";
import type { ListCrawl } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";

const styles = unsafeCSS(stylesheet);

@customElement("btrix-item-dependency-tree")
@localized()
export class ItemDependencyTree extends BtrixElement {
  static styles = styles;

  @property({ type: Array })
  items?: ListCrawl[];

  private readonly dependenciesMap = new Map<
    string,
    ListCrawl | Promise<ListCrawl | undefined>
  >();

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("items") && this.items) {
      const itemsMap = new Map(this.items.map((item) => [item.id, item]));

      this.items.forEach((item) => {
        item.requiresCrawls.forEach((id) => {
          if (itemsMap.get(id)) {
            this.dependenciesMap.set(id, item);
          } else {
            this.dependenciesMap.set(id, this.getItem(id));
          }
        });
      });
    }
  }

  private async getItem(id: string) {
    console.log(id);
    // TODO
    return await Promise.resolve(undefined);
  }

  render() {
    if (!this.items?.length) return;

    return html`
      <btrix-overflow-scroll>
        <sl-tree class="-ml-2 min-w-[50rem]" selection="leaf">
          ${repeat(this.items, ({ id }) => id, this.renderItem)}
        </sl-tree>
      </btrix-overflow-scroll>
    `;
  }

  private readonly renderItem = (item: ListCrawl) => {
    return html`
      <sl-tree-item>
        ${this.renderContent(item)}
        ${item.requiresCrawls.length
          ? html`
              <div
                slot="children"
                class="font-monostyle ml-9 mt-1.5 text-xs leading-none text-neutral-500"
              >
                ${msg("Dependencies")}
              </div>

              ${repeat(item.requiresCrawls, (id) => id, this.renderDependency)}
            `
          : nothing}
      </sl-tree-item>
    `;
  };

  private readonly renderDependency = (id: string) => {
    const skeleton = () => html`
      <div class="item-dependency-tree--row">
        <div>
          <sl-skeleton class="w-4" effect="sheen"></sl-skeleton>
        </div>
        <div>
          <sl-skeleton class="w-[24ch]" effect="sheen"></sl-skeleton>
        </div>
        <div>
          <sl-skeleton class="w-[12ch]" effect="sheen"></sl-skeleton>
        </div>
        <div>
          <sl-skeleton class="w-[8ch]" effect="sheen"></sl-skeleton>
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
      <div
        class="inline-flex h-8 w-full items-center gap-2 rounded bg-neutral-100 px-2"
      >
        <btrix-badge variant="warning"
          >${msg("Missing Dependency")}</btrix-badge
        >
        <div class="text-xs text-neutral-700">
          ${msg("Cannot find dependency with ID")} <code>${id}</code>
        </div>
      </div>
    `;
    const item = this.dependenciesMap.get(id);

    return html`<sl-tree-item class="item-dependency-tree--dependency">
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

  private readonly renderContent = (item: ListCrawl) => {
    return html`<div
      class="item-dependency-tree--row item-dependency-tree--item"
    >
      <btrix-crawl-status
        state=${item.state}
        ?stopping=${item.stopping}
        ?shouldPause=${item.shouldPause}
        hideLabel
        hoist
      ></btrix-crawl-status>
      <div>${renderName(item)}</div>
      <div class="flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("Date Finished")} hoist>
          <sl-icon
            name="hourglass-bottom"
            class="text-base text-neutral-600"
          ></sl-icon>
        </sl-tooltip>
        ${item.finished
          ? this.localize.date(item.finished, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : noData}
      </div>
      <div class="flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("File Size")} hoist>
          <sl-icon
            name="file-earmark-binary"
            class="text-base text-neutral-600"
          ></sl-icon>
        </sl-tooltip>
        ${this.localize.bytes(item.fileSize || 0)}
      </div>
      <div class="flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("Pages")} hoist>
          <sl-icon
            name="window-stack"
            class="text-base text-neutral-600"
          ></sl-icon>
        </sl-tooltip>
        <span
          >${this.localize.number(item.pageCount || 0)}
          ${pluralOf("pages", item.pageCount || 0)}</span
        >
      </div>
      <sl-tooltip placement="right" content=${msg("Open in New Tab")} hoist>
        <sl-icon-button
          name="arrow-up-right"
          href="${this.navigate
            .orgBasePath}/${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}"
          target="_blank"
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
          }}
        >
        </sl-icon-button>
      </sl-tooltip>
    </div>`;
  };
}
