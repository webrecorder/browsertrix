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
import type { TemplateResult } from "lit";
import { LitElement, html, css } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import queryString from "query-string";

import { RelativeDuration } from "@/components/ui/relative-duration";
import type { Crawl } from "@/types/crawler";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import { renderName } from "@/utils/crawler";
import { TailwindElement } from "@/classes/TailwindElement";

@localized()
@customElement("btrix-crawl-list-item")
export class CrawlListItem extends TailwindElement {
  static styles = css`
    :host {
      grid-column: var(--btrix-table-grid-column);
      display: grid;
      grid-template-columns: subgrid;
    }
  `;

  @property({ type: Object })
  crawl?: Crawl;

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @query(".row")
  row!: HTMLElement;

  @query("btrix-overflow-dropdown")
  dropdownMenu!: OverflowDropdown;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  render() {
    if (!this.crawl) return;
    const search =
      this.collectionId || this.workflowId
        ? `?${queryString.stringify(
            {
              collectionId: this.collectionId,
              workflowId: this.workflowId,
            },
            { skipEmptyString: true }
          )}`
        : "";
    return html`
      <btrix-table-row
        @click=${async (e: MouseEvent) => {
          if (e.target === this.dropdownMenu) {
            return;
          }
          e.preventDefault();
        }}
      >
        <btrix-table-cell class="pl-2 pr-0">
          ${this.safeRender(
            (workflow) => html`
              <btrix-crawl-status
                state=${workflow.state}
                hideLabel
              ></btrix-crawl-status>
            `
          )}
        </btrix-table-cell>
        <btrix-table-cell class="pl-0">
          <div class="max-w-sm truncate">
            ${this.safeRender((workflow) => renderName(workflow))}
          </div>
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender(
            (crawl) =>
              html`
                <sl-format-date
                  date=${`${crawl.started}Z`}
                  month="2-digit"
                  day="2-digit"
                  year="2-digit"
                  hour="2-digit"
                  minute="2-digit"
                ></sl-format-date>
              `
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) =>
            crawl.finished
              ? html`
                  <sl-format-date
                    date=${`${crawl.finished}Z`}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="2-digit"
                    minute="2-digit"
                  ></sl-format-date>
                `
              : html`<span class="text-neutral-400" role="presentation"
                  >---</span
                >`
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) =>
            RelativeDuration.humanize(
              (crawl.finished
                ? new Date(`${crawl.finished}Z`)
                : new Date()
              ).valueOf() - new Date(`${crawl.started}Z`).valueOf()
            )
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-format-bytes
            value=${this.crawl.fileSize || 0}
            display="narrow"
          ></sl-format-bytes>
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) => {
            const pagesComplete = +(crawl.stats?.done || 0);
            const pagesFound = +(crawl.stats?.found || 0);
            if (crawl.finished) {
              return pagesComplete === 1
                ? msg(str`${this.numberFormatter.format(pagesComplete)} page`)
                : msg(str`${this.numberFormatter.format(pagesComplete)} pages`);
            }
            return pagesFound === 1
              ? msg(
                  str`${this.numberFormatter.format(
                    pagesComplete
                  )} / ${this.numberFormatter.format(pagesFound)} page`
                )
              : msg(
                  str`${this.numberFormatter.format(
                    pagesComplete
                  )} / ${this.numberFormatter.format(pagesFound)} pages`
                );
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
    render: (crawl: Crawl) => string | TemplateResult<1> | undefined
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

@localized()
@customElement("btrix-crawl-list")
export class CrawlList extends TailwindElement {
  static styles = css`
    btrix-table {
      --btrix-cell-gap: var(--sl-spacing-x-small);
      --btrix-cell-padding-top: var(--sl-spacing-2x-small);
      --btrix-cell-padding-bottom: var(--sl-spacing-2x-small);
      --btrix-cell-padding-left: var(--sl-spacing-small);
      --btrix-cell-padding-right: var(--sl-spacing-small);
      --btrix-table-grid-auto-columns: min-content auto auto auto auto auto auto
        min-content;
    }
  `;

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @property({ type: String })
  itemType: Crawl["type"] = "crawl";

  @queryAssignedElements({ selector: "btrix-crawl-list-item" })
  listItems!: Array<HTMLElement>;

  render() {
    return html` <div class="overflow-auto">
      <btrix-table>
        <btrix-table-head class="mb-2">
          <btrix-table-header-cell class="pl-2 pr-0">
            <span class="sr-only">${msg("Status")}</span>
          </btrix-table-header-cell>
          <btrix-table-header-cell class="pl-0">
            ${msg("Name")}</btrix-table-header-cell
          >
          <btrix-table-header-cell> ${msg("Started")} </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Finished")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Duration")}</btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Size")}</btrix-table-header-cell>
          <btrix-table-header-cell
            >${msg("Pages Crawled")}</btrix-table-header-cell
          >
          <btrix-table-header-cell>
            ${msg("Created By")}
          </btrix-table-header-cell>
          <btrix-table-header-cell class="pl-1 pr-1">
            <span class="sr-only">${msg("Row Actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body class="border rounded overflow-hidden">
          <slot @slotchange=${this.handleSlotchange}></slot>
        </btrix-table-body>
      </btrix-table>
    </div>`;
  }

  private handleSlotchange() {
    const assignProp = (
      el: HTMLElement,
      attr: { name: string; value: string }
    ) => {
      if (!el.attributes.getNamedItem(attr.name)) {
        el.setAttribute(attr.name, attr.value);
      }
    };

    this.listItems.forEach((el) => {
      assignProp(el, { name: "role", value: "listitem" });
      assignProp(el, { name: "collectionId", value: this.collectionId || "" });
      assignProp(el, { name: "workflowId", value: this.workflowId || "" });
    });
  }
}
