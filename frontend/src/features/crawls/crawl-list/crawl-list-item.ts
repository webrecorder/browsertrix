import { localized, msg } from "@lit/localize";
import { css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import type { Crawl } from "@/types/crawler";
import { isSkipped, renderName } from "@/utils/crawler";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

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
      border-top: var(--btrix-border-top, 0px solid transparent);
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
        <btrix-table-cell class="clickLabel pl-0" role="generic">
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

    const skipped = isSkipped(this.crawl);
    const hasExec = Boolean(this.crawl.crawlExecSeconds);
    const notApplicable = html`<sl-tooltip content=${msg("Not applicable")}>
      <sl-icon name="slash" class="text-base text-neutral-400"></sl-icon>
    </sl-tooltip>`;

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
            (crawl: Crawl) => html`
              <btrix-crawl-status
                state=${crawl.state}
                ?stopping=${crawl.stopping}
                ?shouldPause=${crawl.shouldPause}
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
              : notApplicable,
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) =>
            !skipped
              ? html`<sl-tooltip>
                  ${humanizeExecutionSeconds(crawl.crawlExecSeconds, {
                    style: "short",
                  })}
                  <span slot="content">
                    ${humanizeExecutionSeconds(crawl.crawlExecSeconds, {
                      style: "long",
                    })}
                  </span>
                </sl-tooltip>`
              : notApplicable,
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) => {
            if (hasExec) {
              const pagesComplete = crawl.finished
                ? crawl.pageCount
                  ? +crawl.pageCount
                  : 0
                : +(crawl.stats?.done || 0);

              return this.localize.number(pagesComplete, {
                notation: "compact",
              });
            }

            return notApplicable;
          })}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) =>
            hasExec
              ? this.localize.bytes(
                  crawl.finished
                    ? crawl.fileSize || 0
                    : +(crawl.stats?.size || 0),
                )
              : notApplicable,
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender(
            (crawl) =>
              html`<sl-tooltip content=${crawl.userName}
                ><btrix-user-chip
                  class="max-w-full"
                  userId=${crawl.userid}
                  userName=${crawl.userName}
                ></btrix-user-chip
              ></sl-tooltip>`,
          )}
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
