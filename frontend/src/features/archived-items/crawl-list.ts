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
 */
import { localized, msg } from "@lit/localize";
import { css, html, nothing, type TemplateResult } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { TailwindElement } from "@/classes/TailwindElement";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import type { Crawl } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";

/**
 * @slot menu
 */
@customElement("btrix-crawl-list-item")
@localized()
export class CrawlListItem extends BtrixElement {
  static styles = css`
    :host {
      display: contents;
    }

    btrix-table-row {
      border-top: var(--btrix-border-top, 0);
      border-radius: var(--btrix-border-radius-top, 0)
        var(--btrix-border-radius-to, 0) var(--btrix-border-radius-bottom, 0)
        var(--btrix-border-radius-bottom, 0);
    }
  `;

  @property({ type: Object })
  crawl?: Crawl;

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @property({ type: String })
  href?: string;

  @query(".row")
  row!: HTMLElement;

  @query("btrix-overflow-dropdown")
  dropdownMenu!: OverflowDropdown;

  render() {
    if (!this.crawl) return;
    let idCell: TemplateResult;

    if (this.workflowId) {
      const label = html`
        <div>
          ${this.safeRender(
            (crawl) => html`
              <btrix-format-date
                date=${crawl.started}
                month="2-digit"
                day="2-digit"
                year="numeric"
                hour="2-digit"
                minute="2-digit"
              ></btrix-format-date>
            `,
          )}
        </div>
      `;
      idCell = html`
        <btrix-table-cell
          rowClickTarget=${ifDefined(this.href ? "a" : undefined)}
        >
          ${this.href
            ? html`<a href=${this.href} @click=${this.navigate.link}>
                ${label}
              </a>`
            : html`<div>${label}</div> `}
        </btrix-table-cell>
      `;
    } else {
      const label = html`
        <btrix-table-cell class="clickLabel" role="generic">
          ${this.safeRender((workflow) => renderName(workflow))}
        </btrix-table-cell>
      `;
      idCell = html`
        <btrix-table-cell rowClickTarget="a">
          ${this.href
            ? html`<a href=${this.href} @click=${this.navigate.link}>
                ${label}
              </a>`
            : html`<div>${label}</div> `}
        </btrix-table-cell>
      `;
    }

    return html`
      <btrix-table-row
        class=${this.href
          ? "cursor-pointer select-none transition-colors hover:bg-neutral-50 focus-within:bg-neutral-50"
          : ""}
        @click=${async (e: MouseEvent) => {
          if (e.target === this.dropdownMenu) {
            return;
          }
          e.preventDefault();
        }}
      >
        <btrix-table-cell class="pr-0">
          ${this.safeRender(
            (workflow) => html`
              <btrix-crawl-status
                state=${workflow.state}
                hideLabel
                hoist
              ></btrix-crawl-status>
            `,
          )}
        </btrix-table-cell>
        ${idCell}
        ${this.workflowId
          ? nothing
          : html`
              <btrix-table-cell>
                ${this.safeRender(
                  (crawl) => html`
                    <btrix-format-date
                      date=${crawl.started}
                      month="2-digit"
                      day="2-digit"
                      year="numeric"
                      hour="2-digit"
                      minute="2-digit"
                    ></btrix-format-date>
                  `,
                )}
              </btrix-table-cell>
            `}
        <btrix-table-cell>
          ${this.safeRender((crawl) =>
            crawl.finished
              ? html`
                  <btrix-format-date
                    date=${crawl.finished}
                    month="2-digit"
                    day="2-digit"
                    year="numeric"
                    hour="2-digit"
                    minute="2-digit"
                  ></btrix-format-date>
                `
              : html`<span class="text-neutral-400" role="presentation"
                  >---</span
                >`,
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) =>
            this.localize.humanizeDuration(
              (crawl.finished
                ? new Date(crawl.finished)
                : new Date()
              ).valueOf() - new Date(crawl.started).valueOf(),
            ),
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.localize.bytes(this.crawl.fileSize || 0, {
            unitDisplay: "narrow",
          })}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) => {
            const pagesFound = +(crawl.stats?.found || 0);
            if (crawl.finished) {
              const pagesComplete = crawl.pageCount ? +crawl.pageCount : 0;
              return `${this.localize.number(pagesComplete, { notation: "compact" })} ${pluralOf("pages", pagesComplete)}`;
            }

            const pagesComplete = +(crawl.stats?.done || 0);
            return `${this.localize.number(pagesComplete, { notation: "compact" })} / ${this.localize.number(pagesFound, { notation: "compact" })} ${pluralOf("pages", pagesFound)}`;
          })}
        </btrix-table-cell>
        <btrix-table-cell>
          <div class="max-w-sm truncate">
            ${this.safeRender((crawl) => crawl.userName)}
          </div>
        </btrix-table-cell>
        <btrix-table-cell class="pl-1 pr-1">
          ${this.renderActions()}
        </btrix-table-cell>
      </btrix-table-row>
    `;
  }

  private safeRender(
    render: (crawl: Crawl) => string | TemplateResult<1> | undefined,
  ) {
    if (!this.crawl) {
      return html`<sl-skeleton></sl-skeleton>`;
    }
    return render(this.crawl);
  }

  private renderActions() {
    return html` <div class="col action">
      <btrix-overflow-dropdown
        @click=${(e: MouseEvent) => {
          // Prevent navigation to detail view
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <slot name="menu"></slot>
      </btrix-overflow-dropdown>
    </div>`;
  }
}

/**
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
    return html` <style>
        btrix-table {
          --btrix-table-grid-template-columns: min-content [clickable-start]
            ${this.workflowId ? "" : `auto `}auto auto auto auto auto auto
            [clickable-end] min-content;
        }
      </style>
      <btrix-overflow-scroll class="-mx-3 part-[content]:px-3">
        <btrix-table>
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
              ${msg("Started")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Finished")}
            </btrix-table-header-cell>
            <btrix-table-header-cell
              >${msg("Duration")}</btrix-table-header-cell
            >
            <btrix-table-header-cell>${msg("Size")}</btrix-table-header-cell>
            <btrix-table-header-cell
              >${msg("Pages Crawled")}</btrix-table-header-cell
            >
            <btrix-table-header-cell>
              ${msg("Created By")}
            </btrix-table-header-cell>
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
