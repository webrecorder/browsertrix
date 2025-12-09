import { localized, msg } from "@lit/localize";
import type { SlTree, SlTreeItem } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
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

  @query("sl-tree")
  private readonly tree?: SlTree | null;

  private readonly timerIds: number[] = [];

  private readonly dependenciesMap = new Map<
    string,
    Crawl | Promise<Crawl | undefined>
  >();

  disconnectedCallback(): void {
    this.timerIds.forEach(window.clearTimeout);
    super.disconnectedCallback();
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("items") && this.items) {
      const itemsMap = new Map(this.items.map((item) => [item.id, item]));

      this.items.forEach((item) => {
        item.requiresCrawls.forEach((id) => {
          if (!this.dependenciesMap.get(id)) {
            const cachedItem = itemsMap.get(id);
            if (cachedItem) {
              this.dependenciesMap.set(id, cachedItem);
            } else {
              this.dependenciesMap.set(id, this.getCrawl(id));
            }
          }
        });
      });
    }
  }

  render() {
    if (!this.items?.length) return;

    return html`
      <sl-tree class="divide-y" selection="leaf">
        ${repeat(this.items, ({ id }) => id, this.renderItem)}
      </sl-tree>
    `;
  }

  private readonly renderItem = (item: Crawl) => {
    const hasDependencies = item.requiresCrawls.length;
    return html`
      <sl-tree-item
        id=${item.id}
        class=${clsx(
          !hasDependencies &&
            tw`transition-colors duration-slow part-[base]:cursor-default`,
        )}
      >
        ${this.renderContent(item)}
        ${hasDependencies
          ? item.requiresCrawls.map(this.renderDependency)
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

    return html`<sl-tree-item
      class="item-dependency-tree--dependency"
      @click=${() => {
        const item = this.tree?.querySelector<SlTreeItem>(`#${id}`);
        // Highlight item
        const classes = [tw`bg-cyan-50`];

        if (item) {
          item.scrollIntoView({ behavior: "smooth" });
          item.focus();
          item.classList.add(...classes);
          const removeHighlight = () => item.classList.remove(...classes);

          item.addEventListener("click", removeHighlight, { once: true });

          this.timerIds.push(
            window.setTimeout(() => {
              removeHighlight();
              item.removeEventListener("click", removeHighlight);
            }, 2000),
          );
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
    const purgeable =
      !item.dedupeCollId || !item.collectionIds.includes(item.dedupeCollId);
    const status = () => {
      let icon = "check-circle";
      let variant = tw`text-cyan-500`;
      let tooltip = "In Collection";

      if (purgeable) {
        icon = "trash2";
        variant = tw`text-neutral-500`;
        tooltip = msg("Purgeable");
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
        "item-dependency-tree--row item-dependency-tree--content",
        purgeable && tw`item-dependency-tree--purgeable`,
      )}
    >
      ${status()}
      <div class="item-dependency-tree--detail">
        <sl-tooltip content=${msg("Dedupe Dependencies")} hoist>
          <sl-icon name=${dedupeIconFor.dependent}></sl-icon>
        </sl-tooltip>
        <span
          >${this.localize.number(item.requiresCrawls.length)}
          ${pluralOf("dependencies", item.requiresCrawls.length)}</span
        >
      </div>
      <div class="item-dependency-tree--detail">
        <sl-tooltip content=${msg("Date Started")} hoist>
          <sl-icon name="hourglass-top"></sl-icon>
        </sl-tooltip>
        ${date(item.started)}
      </div>
      <div class="item-dependency-tree--detail">
        <sl-tooltip content=${msg("Date Finished")} hoist>
          <sl-icon name="hourglass-bottom"></sl-icon>
        </sl-tooltip>
        ${item.finished ? date(item.finished) : noData}
      </div>
      <div class="item-dependency-tree--detail">
        <sl-tooltip content=${msg("Pages")} hoist>
          <sl-icon name="window-stack"></sl-icon>
        </sl-tooltip>
        <span
          >${this.localize.number(item.pageCount || 0)}
          ${pluralOf("pages", item.pageCount || 0)}</span
        >
      </div>
      <div
        class="item-dependency-tree--detail flex items-center gap-1.5 truncate"
      >
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
    return html`<sl-icon-button
      name="link"
      href=${href}
      label=${msg("Visit Link")}
      @click=${(e: MouseEvent) => {
        e.stopPropagation();
      }}
    >
    </sl-icon-button>`;
  }

  private async getCrawl(id: string) {
    try {
      return await this.api.fetch<Crawl>(`/orgs/${this.orgId}/crawls/${id}`);
    } catch (err) {
      console.debug(err);
    }
  }
}
