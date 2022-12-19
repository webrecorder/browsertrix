/**
 * Display list of crawls
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-list>
 *   <btrix-crawl-list-item crawl=${crawl1}>
 *   </btrix-crawl-list-item>
 *   <btrix-crawl-list-item crawl=${crawl2}>
 *   </btrix-crawl-list-item>
 * </btrix-crawl-list>
 * ```
 */
import { LitElement, html, css } from "lit";
import { property, queryAssignedElements } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import { RelativeDuration } from "./relative-duration";
import { Crawl } from "../pages/archive/types";

function getFileSize(resources: Crawl["resources"]) {
  if (!resources) return 0;
  return resources.reduce((prev, curr) => prev + curr.size, 0);
}

@localized()
export class CrawlListItem extends LitElement {
  static styles = css`
    .item {
      display: grid;
      grid-template-columns: 1fr;
    }

    .col:not(.action) {
      padding: var(--sl-spacing-small);
    }

    .col:first-child {
      padding-left: var(--sl-spacing-medium);
    }

    .detail,
    .desc {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail {
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-medium);
      line-height: 1.4;
      margin-bottom: var(--sl-spacing-3x-small);
    }

    .desc {
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
      font-family: var(--font-monostyle-family);
      font-variation-settings: var(--font-monostyle-variation);
      line-height: 1.4;
    }

    .state {
      text-transform: capitalize;
    }

    .action sl-icon-button {
      font-size: 1rem;
    }

    @media only screen and (min-width: 30rem) {
      .item {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media only screen and (min-width: 60rem) {
      .item {
        grid-template-columns: 25rem 10rem 10rem 1fr min-content;
      }

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
  `;

  @property({ type: Object })
  crawl?: Crawl;

  render() {
    return html`<article class="item">
      <div class="col">
        <div class="detail">
          ${this.safeRender((crawl) => crawl.configName)}
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
        <!-- TODO handle active state -->
        <div class="detail state">
          ${this.safeRender((crawl) => crawl.state)}
        </div>
        <div class="desc">
          ${this.safeRender((crawl) =>
            msg(
              str`Finished in ${RelativeDuration.humanize(
                new Date(`${crawl.finished}Z`).valueOf() -
                  new Date(`${crawl.started}Z`).valueOf(),
                { compact: true }
              )}`
            )
          )}
        </div>
      </div>
      <div class="col">
        <div class="detail">
          ${this.safeRender((crawl) =>
            crawl.fileSize !== undefined
              ? html`<sl-format-bytes
                  value=${crawl.fileSize}
                ></sl-format-bytes>`
              : html`
                  <sl-format-bytes
                    value=${getFileSize(crawl.resources)}
                  ></sl-format-bytes>
                `
          )}
        </div>
        <div class="desc">
          ${this.safeRender((crawl) => {
            const pagesComplete = crawl.stats?.done || 0;
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
          ${this.safeRender((crawl) =>
            crawl.manual ? msg("Manual Start") : msg("Recurring Schedule")
          )}
        </div>
        <div class="desc">
          ${this.safeRender((crawl) =>
            crawl.manual
              ? msg(str`by ${crawl.userName}`)
              : msg(str`Created by ${crawl.userName}`)
          )}
        </div>
      </div>
      <div class="col action">
        <sl-dropdown
          @click=${(e: Event) => e.preventDefault()}
          distance="4"
          hoist
        >
          <sl-icon-button
            slot="trigger"
            name="three-dots-vertical"
            label=${msg("More")}
          ></sl-icon-button>
          <slot name="menu"></slot>
        </sl-dropdown>
      </div>
    </article>`;
  }

  private safeRender(render: (crawl: Crawl) => any) {
    if (!this.crawl) {
      return html`<sl-skeleton></sl-skeleton>`;
    }
    return render(this.crawl);
  }
}

export class CrawlList extends LitElement {
  static styles = css``;

  @queryAssignedElements({ selector: "btrix-crawl-list-item" })
  listItems!: Array<HTMLElement>;

  render() {
    return html`<div role="list">
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
