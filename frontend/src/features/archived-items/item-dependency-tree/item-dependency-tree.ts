import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";

import stylesheet from "./item-dependency-tree.stylesheet.css";

import { BtrixElement } from "@/classes/BtrixElement";
import { dedupeIconFor } from "@/features/collections/dedupe-badge";
import { OrgTab, WorkflowTab } from "@/routes";
import { noData } from "@/strings/ui";
import type { Crawl } from "@/types/crawler";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const styles = unsafeCSS(stylesheet);

@customElement("btrix-item-dependency-tree")
@localized()
export class ItemDependencyTree extends BtrixElement {
  static styles = styles;

  @property({ type: Array })
  items?: Crawl[];

  private readonly dependenciesMap = new Map<
    string,
    Crawl | Promise<Crawl | undefined>
  >();

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("items") && this.items) {
      const itemsMap = new Map(this.items.map((item) => [item.id, item]));

      this.items.forEach((item) => {
        item.requiresCrawls.forEach((id) => {
          if (itemsMap.get(id)) {
            this.dependenciesMap.set(id, item);
          } else {
            this.dependenciesMap.set(id, this.getCrawl(id));
          }
        });
      });
    }
  }

  render() {
    if (!this.items?.length) return;

    return html`
      <sl-tree class="-ml-2 min-w-[50rem]" selection="leaf">
        ${repeat(this.items, ({ id }) => id, this.renderItem)}
      </sl-tree>
    `;
  }

  private readonly renderItem = (item: Crawl) => {
    const hasDependencies = item.requiresCrawls.length;
    return html`
      <sl-tree-item
        class=${clsx(!hasDependencies && tw`part-[base]:cursor-default`)}
      >
        ${this.renderContent(item)}
        ${hasDependencies
          ? html`
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
        class="inline-flex h-8 w-full items-center gap-2 rounded bg-neutral-200 px-2"
      >
        <btrix-badge variant="warning"
          >${msg("Missing Dependency")}</btrix-badge
        >
        <div class="font-monostyle text-xs text-neutral-600">
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

  private readonly renderContent = (item: Crawl) => {
    return html`<div
      class="item-dependency-tree--row item-dependency-tree--content"
    >
      <btrix-crawl-status
        state=${item.state}
        ?stopping=${item.stopping}
        ?shouldPause=${item.shouldPause}
        hideLabel
        hoist
      ></btrix-crawl-status>
      <div class="flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("Date Started")} hoist>
          <sl-icon name="hourglass-top"></sl-icon>
        </sl-tooltip>
        ${item.finished
          ? this.localize.date(item.started, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : noData}
      </div>
      <div class="flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("Date Finished")} hoist>
          <sl-icon name="hourglass-bottom"></sl-icon>
        </sl-tooltip>
        ${item.finished
          ? this.localize.date(item.finished, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : noData}
      </div>
      <div class="flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("Dedupe Dependencies")} hoist>
          <sl-icon name=${dedupeIconFor.dependent}></sl-icon>
        </sl-tooltip>
        <span
          >${this.localize.number(item.requiresCrawls.length)}
          ${pluralOf("dependencies", item.requiresCrawls.length)}</span
        >
      </div>
      <div class="flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("Pages")} hoist>
          <sl-icon name="window-stack"></sl-icon>
        </sl-tooltip>
        <span
          >${this.localize.number(item.pageCount || 0)}
          ${pluralOf("pages", item.pageCount || 0)}</span
        >
      </div>
      <div class="flex items-center gap-1.5 truncate">
        <sl-tooltip content=${msg("Size")} hoist>
          <sl-icon name="file-earmark-binary"></sl-icon>
        </sl-tooltip>
        <sl-format-bytes
          value=${item.fileSize || 0}
          display="short"
        ></sl-format-bytes>
      </div>
      ${this.renderLink(
        `${this.navigate.orgBasePath}/${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}`,
      )}
    </div>`;
  };

  private renderLink(href: string) {
    return html`<sl-tooltip
      placement="right"
      content=${msg("Open in New Tab")}
      hoist
    >
      <sl-icon-button
        name="arrow-up-right"
        href=${href}
        target="_blank"
        @click=${(e: MouseEvent) => {
          e.stopPropagation();
        }}
      >
      </sl-icon-button>
    </sl-tooltip>`;
  }

  private async getCrawl(id: string) {
    try {
      return await this.api.fetch<Crawl>(`/orgs/${this.orgId}/crawls/${id}`);
    } catch (err) {
      console.debug(err);
    }
  }
}
