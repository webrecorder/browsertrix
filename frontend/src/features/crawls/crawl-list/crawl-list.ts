import { localized, msg } from "@lit/localize";
import { css, html, nothing } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * Display list of crawls
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-list>
 *   <btrix-crawl-list-item .crawl=${crawl1}>
 *   </btrix-crawl-list-item>
 *   <btrix-crawl-list-item .crawl=${crawl2}>
 *   </btrix-crawl-list-item>
 * </btrix-crawl-list>
 * ```
 *
 * @slot
 */
@customElement("btrix-crawl-list")
@localized()
export class CrawlList extends TailwindElement {
  static styles = css`
    btrix-table {
      --btrix-table-cell-gap: var(--sl-spacing-x-small);
      --btrix-table-cell-padding-x: var(--sl-spacing-small);
    }

    btrix-table-body {
      --btrix-table-cell-padding-y: var(--sl-spacing-2x-small);
    }

    btrix-table-body ::slotted(*:nth-of-type(n + 2)) {
      --btrix-border-top: 1px solid var(--sl-panel-border-color);
    }

    btrix-table-body ::slotted(*:first-of-type) {
      --btrix-border-radius-top: var(--sl-border-radius-medium);
    }

    btrix-table-body ::slotted(*:last-of-type) {
      --btrix-border-radius-bottom: var(--sl-border-radius-medium);
    }
  `;

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @queryAssignedElements({ selector: "btrix-crawl-list-item" })
  listItems!: HTMLElement[];

  render() {
    const columns = [
      "min-content [clickable-start]",
      this.workflowId ? undefined : "minmax(22ch, 36ch)", // Name
      "minmax(min-content, 22ch)", // Started
      "minmax(min-content, 22ch)", // Finished
      "1fr", // Execution time
      "1fr", // Pages
      "1fr", // Size
      "[clickable-end] minmax(max-content, 20ch)", // Run by
      "min-content",
    ]
      .filter((v) => v)
      .join(" ");

    return html` <btrix-overflow-scroll class="-mx-3 part-[content]:px-3">
      <btrix-table
        style="--btrix-table-grid-template-columns: ${columns}"
        class="whitespace-nowrap"
      >
        <btrix-table-head class="mb-2">
          <btrix-table-header-cell class="pr-0">
            <span class="sr-only">${msg("Status")}</span>
          </btrix-table-header-cell>
          ${this.workflowId
            ? nothing
            : html`
                <btrix-table-header-cell>
                  ${msg("Name")}
                </btrix-table-header-cell>
              `}
          <btrix-table-header-cell>
            ${msg("Date Started")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Date Finished")}
          </btrix-table-header-cell>
          <btrix-table-header-cell title=${msg("Execution Time")}
            >${msg("Exec Time")}</btrix-table-header-cell
          >
          <btrix-table-header-cell>${msg("Pages")}</btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Size")}</btrix-table-header-cell>
          <btrix-table-header-cell> ${msg("Run By")} </btrix-table-header-cell>
          <btrix-table-header-cell class="pl-1 pr-1">
            <span class="sr-only">${msg("Row actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body class="rounded border">
          <slot @slotchange=${this.handleSlotchange}></slot>
        </btrix-table-body>
      </btrix-table>
    </btrix-overflow-scroll>`;
  }

  private handleSlotchange() {
    const assignProp = (
      el: HTMLElement,
      attr: { name: string; value: string },
    ) => {
      if (!el.attributes.getNamedItem(attr.name)) {
        el.setAttribute(attr.name, attr.value);
      }
    };

    this.listItems.forEach((item) => {
      assignProp(item, {
        name: "collectionId",
        value: this.collectionId || "",
      });
      assignProp(item, { name: "workflowId", value: this.workflowId || "" });
    });
  }
}
