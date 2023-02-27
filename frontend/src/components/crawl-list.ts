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
import { LitElement, html, css } from "lit";
import { property, queryAssignedElements } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";

import { RelativeDuration } from "./relative-duration";
import type { Crawl } from "../types/crawler";
import { srOnly } from "../utils/css";
import type { NavigateEvent } from "../utils/LiteElement";

const largeBreakpointCss = css`60rem`;
const rowCss = css`
  .row {
    display: grid;
    grid-template-columns: 1fr;
  }

  @media only screen and (min-width: 30rem) {
    .row {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media only screen and (min-width: ${largeBreakpointCss}) {
    .row {
      grid-template-columns: 1fr 15rem 11rem 11rem 3rem;
    }
  }

  .col {
    grid-column: span 1;
  }
`;
const columnCss = css`
  .col:not(.action) {
    padding-left: var(--sl-spacing-small);
    padding-right: var(--sl-spacing-small);
  }

  .col:first-child {
    padding-left: var(--sl-spacing-medium);
  }
`;
// Shared custom variables
const hostVars = css`
  :host {
    --row-offset: var(--sl-spacing-x-small);
  }
`;

@localized()
export class CrawlListItem extends LitElement {
  static styles = [
    rowCss,
    columnCss,
    hostVars,
    css`
      a {
        all: unset;
      }

      .item {
        cursor: pointer;
        transition-property: background-color, box-shadow, margin;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
      }

      .item:hover {
        background-color: var(--sl-color-neutral-50);
        margin-left: calc(-1 * var(--row-offset));
        margin-right: calc(-1 * var(--row-offset));
      }

      .item:hover .col:nth-child(n + 2) {
        margin-left: calc(-1 * var(--row-offset));
      }

      .item:hover .col.action {
        margin-left: calc(-2 * var(--row-offset));
      }

      .row {
        border: 1px solid var(--sl-panel-border-color);
        border-radius: var(--sl-border-radius-medium);
        box-shadow: var(--sl-shadow-x-small);
      }

      .row:hover {
        box-shadow: var(--sl-shadow-small);
      }

      .col {
        padding-top: var(--sl-spacing-small);
        padding-bottom: var(--sl-spacing-small);
        transition-property: margin;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
      }

      .detail {
        color: var(--sl-color-neutral-700);
        font-size: var(--sl-font-size-medium);
        line-height: 1.4;
        margin-bottom: var(--sl-spacing-3x-small);
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .desc {
        color: var(--sl-color-neutral-500);
        font-size: var(--sl-font-size-x-small);
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
        line-height: 1.4;
      }

      .name {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .primaryUrl {
        word-break: break-all;
      }

      .finished {
        margin-left: calc(1rem + var(--sl-spacing-x-small));
      }

      .userName {
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
      }

      .action {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .action sl-icon-button {
        font-size: 1rem;
      }

      @media only screen and (min-width: ${largeBreakpointCss}) {
        .action {
          border-left: 1px solid var(--sl-panel-border-color);
          display: flex;
          align-items: stretch;
        }

        .action sl-dropdown {
          display: flex;
          align-items: center;
        }
      }
    `,
  ];

  @property({ type: Object })
  crawl?: Crawl;

  render() {
    const isActive =
      this.crawl &&
      ["starting", "running", "stopping"].includes(this.crawl.state);

    return html`<a
      class="item row"
      role="button"
      href=${`/orgs/${this.crawl?.oid}/crawls/crawl/${this.crawl?.id}`}
      @click=${async (e: MouseEvent) => {
        e.preventDefault();
        await this.updateComplete;
        const href = (e.currentTarget as HTMLAnchorElement).href;
        // TODO consolidate with LiteElement navTo
        const evt: NavigateEvent = new CustomEvent("navigate", {
          detail: { url: href },
          bubbles: true,
          composed: true,
        });
        this.dispatchEvent(evt);
      }}
    >
      <div class="col">
        <div class="detail url">
          ${this.safeRender(
            (crawl) =>
              crawl.configName ||
              html`<span class="primaryUrl">${crawl.firstSeed}</span>`
          )}
        </div>
        <div class="desc">
          ${this.safeRender(
            (crawl) => html`
              <sl-format-date
                date=${crawl.started}
                month="2-digit"
                day="2-digit"
                year="2-digit"
                hour="2-digit"
                minute="2-digit"
              ></sl-format-date>
            `
          )}
        </div>
      </div>
      <div class="col">
        <div class="detail">
          ${this.safeRender(
            (crawl) => html`
              <btrix-crawl-status state=${crawl.state}></btrix-crawl-status>
            `
          )}
        </div>
        <div class="desc finished">
          ${this.safeRender((crawl) =>
            crawl.finished
              ? msg(
                  str`Finished in ${RelativeDuration.humanize(
                    new Date(`${crawl.finished}Z`).valueOf() -
                      new Date(`${crawl.started}Z`).valueOf(),
                    { compact: true }
                  )}`
                )
              : msg(
                  str`Started ${RelativeDuration.humanize(
                    new Date().valueOf() -
                      new Date(`${crawl.started}Z`).valueOf(),
                    { compact: true }
                  )} ago`
                )
          )}
        </div>
      </div>
      <div class="col">
        <div class="detail">
          ${this.safeRender(
            (crawl) => html`<sl-format-bytes
              value=${crawl.fileSize || 0}
            ></sl-format-bytes>`
          )}
        </div>
        <div class="desc">
          ${this.safeRender((crawl) => {
            const pagesComplete = crawl.stats?.done || 0;
            if (isActive) {
              const pagesFound = crawl.stats?.found || 0;
              return html`
                ${+pagesFound === 1
                  ? msg(str`${pagesComplete} / ${pagesFound} page`)
                  : msg(str`${pagesComplete} / ${pagesFound} pages`)}
              `;
            }
            return html`
              ${+pagesComplete === 1
                ? msg(str`${pagesComplete} page`)
                : msg(str`${pagesComplete} pages`)}
            `;
          })}
        </div>
      </div>
      <div class="col">
        <div class="detail">
          ${this.safeRender(
            (crawl) => html`<span class="userName">${crawl.userName}</span>`
          )}
        </div>
        <div class="desc">
          ${this.safeRender((crawl) =>
            crawl.manual ? msg("Manual Start") : msg("Scheduled")
          )}
        </div>
      </div>
      <div class="col action">
        <sl-dropdown
          distance="4"
          hoist
          @click=${(e: MouseEvent) => {
            // Prevent anchor link default behavior
            e.preventDefault();
            // Stop prop to anchor link
            e.stopPropagation();
          }}
        >
          <sl-icon-button
            slot="trigger"
            name="three-dots-vertical"
            label=${msg("More")}
          ></sl-icon-button>
          <slot name="menu"></slot>
        </sl-dropdown>
      </div>
    </a>`;
  }

  private safeRender(render: (crawl: Crawl) => any) {
    if (!this.crawl) {
      return html`<sl-skeleton></sl-skeleton>`;
    }
    return render(this.crawl);
  }
}

@localized()
export class CrawlList extends LitElement {
  static styles = [
    srOnly,
    rowCss,
    columnCss,
    hostVars,
    css`
      .listHeader,
      .list {
        margin-left: var(--row-offset);
        margin-right: var(--row-offset);
      }

      .listHeader {
        line-height: 1;
      }

      .row {
        display none;
        font-size: var(--sl-font-size-x-small);
        color: var(--sl-color-neutral-600);
      }

      .col {
        padding-top: var(--sl-spacing-x-small);
        padding-bottom: var(--sl-spacing-x-small);
      }

      @media only screen and (min-width: ${largeBreakpointCss}) {
        .row {
          display: grid;
        }
      }

      ::slotted(btrix-crawl-list-item:not(:last-of-type)) {
        display: block;
        margin-bottom: var(--sl-spacing-x-small);
      }
    `,
  ];

  @queryAssignedElements({ selector: "btrix-crawl-list-item" })
  listItems!: Array<HTMLElement>;

  render() {
    return html` <div class="listHeader row">
        <div class="col">${msg("Name & Start Time")}</div>
        <div class="col">${msg("Status")}</div>
        <div class="col">${msg("Size")}</div>
        <div class="col">${msg("Config Author")}</div>
        <div class="col action">
          <span class="srOnly">${msg("Actions")}</span>
        </div>
      </div>
      <div class="list" role="list">
        <slot @slotchange=${this.handleSlotchange}></slot>
      </div>`;
  }

  private handleSlotchange() {
    this.listItems.map((el) => {
      if (!el.attributes.getNamedItem("role")) {
        el.setAttribute("role", "listitem");
      }
    });
  }
}
