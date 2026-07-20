import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Seed } from "@/types/crawler";

/**
 *
 */
@customElement("btrix-url-list")
@localized()
export class UrlList extends TailwindElement {
  static styles = css`
    btrix-table {
      --btrix-table-grid-template-columns: 1fr min-content min-content;
      --btrix-table-column-gap: var(--sl-spacing-x-small);
    }

    btrix-table-cell,
    btrix-code {
      overflow: hidden;
    }

    btrix-table-cell {
      white-space: nowrap;
    }

    btrix-overflow-scroll {
      --btrix-overflow-scroll-thumb-color: var(--sl-color-neutral-300);
      --btrix-overflow-scroll-track-color: transparent;
    }
  `;

  @property({ type: Array })
  urls?: (string | Seed)[] = [];

  render() {
    if (!this.urls?.length) return;

    return html`<btrix-table class="grid-cols-[1fr_auto]">
      ${this.urls.map((seedOrUrl: string | Seed) => {
        const url = typeof seedOrUrl === "string" ? seedOrUrl : seedOrUrl.url;

        return html`
          <btrix-table-row
            class="rounded transition-colors duration-x-fast even:bg-neutral-50 even:[--btrix-overflow-scroll-scrim-color:--sl-color-neutral-50] has-[btrix-copy-button:hover]:!bg-cyan-50/80 has-[sl-icon-button:hover]:!bg-cyan-50/80"
          >
            <btrix-table-cell>
              <btrix-overflow-scroll
                class="w-[calc(100%+theme(spacing.5))] contain-inline-size part-[content]:px-2"
                hideScrollbar
              >
                <btrix-code
                  language="url"
                  class="block w-max whitespace-nowrap"
                  .value=${url}
                ></btrix-code>
              </btrix-overflow-scroll>
            </btrix-table-cell>
            <btrix-table-cell>
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
    </btrix-table>`;
  }
}
