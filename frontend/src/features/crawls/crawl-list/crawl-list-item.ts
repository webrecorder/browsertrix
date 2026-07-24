import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { textSeparator } from "@/layouts/separator";
import type { Crawl } from "@/types/crawler";
import { isSkipped, renderName } from "@/utils/crawler";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { tw } from "@/utils/tailwind";

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

    const label = this.workflowId
      ? this.safeRender(
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
        )
      : this.safeRender((workflow) => renderName(workflow));

    const skipped = isSkipped(this.crawl);
    const canceled = this.crawl.state === "canceled";
    const hasExec = Boolean(this.crawl.crawlExecSeconds);
    const notApplicable = html`<sl-tooltip content=${msg("Not applicable")}>
      <sl-icon name="slash" class="text-base text-neutral-400"></sl-icon>
    </sl-tooltip>`;

    return html`
      <btrix-table-row
        class=${clsx(
          this.href &&
            tw`cursor-pointer select-none transition-colors duration-fast focus-within:bg-neutral-50 hover:bg-neutral-50`,
        )}
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
        <btrix-table-cell rowClickTarget=${this.href ? "a" : nothing}>
          ${this.href
            ? html`<a href=${this.href} @click=${this.navigate.link}>
                ${label}
              </a>`
            : label}
        </btrix-table-cell>
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
          ${this.safeRender((crawl) => {
            if (crawl.finished) {
              return html`
                <btrix-format-date
                  date=${crawl.finished}
                  month="2-digit"
                  day="2-digit"
                  year="numeric"
                  hour="2-digit"
                  minute="2-digit"
                ></btrix-format-date>
              `;
            }

            const done = +(crawl.stats?.done || 0);
            const found = +(crawl.stats?.found || 0);
            const ratio = done && found ? done / found : 0;
            const percentage = ratio * 100;
            const { cssColor, cssDarkerColor } = CrawlStatus.getContent({
              state: crawl.state,
            });

            return html`<sl-tooltip
              content=${this.localize.number(ratio, {
                style: "percent",
                maximumFractionDigits: 0,
              })}
            >
              <sl-progress-bar
                class="w-full"
                style=${styleMap({
                  "--indicator-color": ratio
                    ? cssColor
                    : "var(--sl-color-neutral-400)",
                  "--btrix-indicator-border-color": ratio
                    ? cssDarkerColor || cssColor
                    : "var(--sl-color-neutral-400)",
                })}
                value=${ifDefined(percentage < 1 ? undefined : percentage)}
                label=${msg("Page Crawl Progress")}
                ?indeterminate=${percentage < 1}
              ></sl-progress-bar>
            </sl-tooltip>`;
          })}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) =>
            !skipped
              ? humanizeExecutionSeconds(crawl.crawlExecSeconds, {
                  style: "short",
                })
              : notApplicable,
          )}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) => {
            if (hasExec && !canceled) {
              if (crawl.finished) {
                return this.localize.number(crawl.pageCount || 0, {
                  notation: "compact",
                });
              }

              const done = +(crawl.stats?.done || 0);
              const found = +(crawl.stats?.found || 0);

              return html`<sl-tooltip
                content="${msg("Pages Crawled")} / ${msg("Pages Found")}"
              >
                <span class="inline-flex items-center gap-1">
                  <span
                    >${this.localize.number(done, {
                      notation: "compact",
                    })}</span
                  >
                  ${textSeparator(tw`text-neutral-500`)}
                  <span class="text-neutral-500"
                    >${this.localize.number(found, {
                      notation: "compact",
                    })}</span
                  >
                </span>
              </sl-tooltip>`;
            }

            return notApplicable;
          })}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.safeRender((crawl) =>
            hasExec && !canceled
              ? this.localize.bytes(
                  crawl.finished
                    ? crawl.fileSize || 0
                    : +(crawl.stats?.size || 0),
                )
              : notApplicable,
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
