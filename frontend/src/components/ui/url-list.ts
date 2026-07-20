import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Seed } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

/**
 *
 */
@customElement("btrix-url-list")
@localized()
export class UrlList extends TailwindElement {
  static styles = css`
    btrix-table-cell,
    btrix-code {
      overflow: hidden;
    }

    btrix-table-row:first-of-type btrix-table-cell:not(.url-order) {
      border-top: 1px solid var(--sl-panel-border-color);
      border-top-left-radius: var(--sl-border-radius-medium);
      border-top-right-radius: var(--sl-border-radius-medium);
    }

    btrix-table-row:last-of-type btrix-table-cell:not(.url-order) {
      border-bottom: 1px solid var(--sl-panel-border-color);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
    }

    btrix-table-row:nth-of-type(even) btrix-table-cell:not(.url-order) {
      --btrix-overflow-scroll-scrim-color: var(--sl-color-neutral-50);
      background-color: var(--sl-color-neutral-50);
    }

    btrix-table-row:has(btrix-copy-button:hover)
      btrix-table-cell:not(.url-order),
    btrix-table-row:has(sl-icon-button:hover) btrix-table-cell:not(.url-order) {
      background-color: var(--sl-color-primary-50) !important;
    }

    btrix-table-cell:first-of-type:not(.url-order),
    .url-order + btrix-table-cell {
      border-left: 1px solid var(--sl-panel-border-color);
    }

    btrix-table-cell:last-of-type {
      border-right: 1px solid var(--sl-panel-border-color);
    }

    btrix-overflow-scroll {
      --btrix-overflow-scroll-thumb-color: var(--sl-color-neutral-300);
      --btrix-overflow-scroll-track-color: transparent;
    }

    code {
      color: var(--sl-color-sky-800);
    }

    sl-icon-button::part(base) {
      padding: var(--sl-spacing-2x-small);
    }

    .url-order {
      color: var(--sl-color-neutral-400);
      font-family: var(--sl-font-mono);
      justify-content: end;
      padding-inline-end: var(--sl-spacing-2x-small);
    }
  `;

  @property({ type: Array })
  urls?: (string | Seed)[] = [];

  /**
   * Enable URI syntax highlighting
   */
  @property({ type: Boolean, noAccessor: true })
  highlight = false;

  /**
   * Display as ordered list
   */
  @property({ type: Boolean, noAccessor: true })
  ordered = false;

  /**
   * Offset ordered list
   */
  @property({ type: Number })
  offset = 1;

  connectedCallback(): void {
    if (this.highlight) {
      this.renderUrl = (url: string) =>
        html`<btrix-code
          language="url"
          class="block w-max"
          .value=${url}
          noWrap
        ></btrix-code>`;
    }
    super.connectedCallback();
  }

  render() {
    if (!this.urls?.length) return;

    return html`<btrix-table
      class=${clsx(
        tw`text-[0.8125rem]`,
        this.ordered
          ? tw`grid-cols-[min-content_1fr_auto]`
          : tw`grid-cols-[1fr_auto]`,
      )}
    >
      <btrix-table-body>
        ${this.urls.map((seedOrUrl, idx) => {
          const url = typeof seedOrUrl === "string" ? seedOrUrl : seedOrUrl.url;

          return html`
            <btrix-table-row>
              ${this.ordered
                ? html`
                    <btrix-table-cell class="url-order"
                      >${idx + this.offset}.</btrix-table-cell
                    >
                  `
                : nothing}
              <btrix-table-cell>
                <btrix-overflow-scroll
                  class="w-[calc(100%+theme(spacing.5))] contain-inline-size part-[content]:px-1.5"
                  hideScrollbar
                >
                  ${this.renderUrl(url)}
                </btrix-overflow-scroll>
              </btrix-table-cell>
              <btrix-table-cell class="px-1">
                <btrix-copy-button .value=${url}></btrix-copy-button>
                <sl-icon-button
                  name="arrow-up-right"
                  href="${url}"
                  target="_blank"
                  label=${msg("Open in New Tab")}
                >
                </sl-icon-button>
              </btrix-table-cell>
            </btrix-table-row>
          `;
        })}
      </btrix-table-body>
    </btrix-table>`;
  }

  private renderUrl = (url: string) => html`<code>${url}</code>`;
}
