import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { FloatingPopover } from "@/components/ui/floating-popover";
import { ClipboardController } from "@/controllers/clipboard";
import type { Seed } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

/**
 *
 */
@customElement("btrix-url-list")
@localized()
export class UrlList extends TailwindElement {
  static styles = css`
    btrix-table-body {
      white-space: nowrap;
      border-collapse: collapse;
    }

    btrix-table-cell,
    btrix-code {
      overflow: hidden;
    }

    btrix-table-cell:not(.url-order) {
      border-top: 1px solid transparent;
      border-bottom: 1px solid transparent;
    }

    btrix-table-row:first-of-type btrix-table-cell:not(.url-order) {
      border-top-color: var(--sl-panel-border-color);
      border-top-left-radius: var(--sl-border-radius-medium);
      border-top-right-radius: var(--sl-border-radius-medium);
    }

    btrix-table-row:last-of-type btrix-table-cell:not(.url-order) {
      border-bottom-color: var(--sl-panel-border-color);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
    }

    btrix-table-row:nth-of-type(even) btrix-table-cell:not(.url-order) {
      --btrix-overflow-scroll-scrim-color: var(--sl-color-neutral-50);
      background-color: var(--sl-color-neutral-50);
    }

    btrix-table-row:has(.url-control:hover) btrix-table-cell:not(.url-order) {
      background-color: var(--sl-color-primary-50) !important;
      border-top: 1px solid var(--sl-color-primary-100);
      border-bottom: 1px solid var(--sl-color-primary-100);
    }

    btrix-table-row:has(.url-control:hover)
      btrix-table-cell:first-of-type:not(.url-order),
    btrix-table-row:has(.url-control:hover) .url-order + btrix-table-cell {
      border-left-color: var(--sl-color-primary-100);
    }

    btrix-table-row:has(.url-control:hover) btrix-table-cell:last-of-type {
      border-right-color: var(--sl-color-primary-100);
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
      width: 100%;
      contain: inline-size;
    }

    .url::part(content) {
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
    }

    .url-order {
      color: var(--sl-color-neutral-500);
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

  private readonly clipboardController = new ClipboardController(this, {
    timeout: 10 * 1000,
  });

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
                <btrix-floating-popover>
                  <div slot="content" class="flex items-center gap-1.5">
                    ${this.clipboardController.isCopied
                      ? html`<sl-icon
                            class="text-success"
                            name="check-lg"
                          ></sl-icon>
                          ${ClipboardController.text.copied}`
                      : html`<sl-icon
                            class="text-neutral-500"
                            name="copy"
                          ></sl-icon>
                          ${msg("Copy URL")}`}
                  </div>
                  <btrix-overflow-scroll
                    class="url-control cursor-pointer part-[content]:px-1.5"
                    hideScrollbar
                    @mousedown=${this.onUrlMouseDown}
                    @mouseup=${this.onUrlMouseUp}
                    @mouseenter=${this.onUrlMouseEnter}
                    @selectstart=${this.onUrlSelectStart}
                    @click=${(e: MouseEvent) => {
                      const sel = window.getSelection();
                      if (sel && !sel.isCollapsed) {
                        const el = e.currentTarget as HTMLElement;
                        const popover = el.closest<FloatingPopover>(
                          "btrix-floating-popover",
                        );

                        if (!popover) {
                          console.debug("no popover");
                          return;
                        }

                        popover.setPosition({ x: e.clientX, y: e.clientY });

                        // Copy only selection
                        void this.clipboardController.copy(sel.toString());
                        void popover.show();
                      } else {
                        // Copy entire URL
                        void this.clipboardController.copy(url);
                      }
                    }}
                  >
                    <btrix-code
                      class="block w-max part-[base]:text-sky-800"
                      language=${ifDefined(this.highlight ? "url" : undefined)}
                      .value=${url}
                      noWrap
                      tabindex="0"
                      @keydown=${(e: KeyboardEvent) =>
                        e.key === "Enter" &&
                        void this.clipboardController.copy(url)}
                    ></btrix-code>
                  </btrix-overflow-scroll>
                </btrix-floating-popover>

                <div>
                  <sl-tooltip content=${msg("Open in New Tab")} hoist>
                    <sl-icon-button
                      class="url-control part-[base]:p-1.5"
                      name="arrow-up-right"
                      href="${url}"
                      target="_blank"
                    >
                    </sl-icon-button>
                  </sl-tooltip>
                </div>
              </btrix-table-cell>
            </btrix-table-row>
          `;
        })}
      </btrix-table-body>
    </btrix-table>`;
  }

  private readonly overrideUrlMouseOver = (e: MouseEvent) =>
    e.stopPropagation();

  private readonly onUrlMouseEnter = () => this.clipboardController.reset();

  /**
   * Disable mouseover on floating popover
   */
  private readonly onUrlMouseDown = (e: MouseEvent) =>
    (e.currentTarget as HTMLElement).addEventListener(
      "mouseover",
      this.overrideUrlMouseOver,
    );

  /**
   * Enable mouseover on floating popover
   */
  private readonly onUrlMouseUp = (e: MouseEvent) =>
    (e.currentTarget as HTMLElement).removeEventListener(
      "mouseover",
      this.overrideUrlMouseOver,
    );

  private readonly onUrlSelectStart = (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    const popover = el.closest<FloatingPopover>("btrix-floating-popover");

    if (!popover) {
      console.debug("no popover");
      return;
    }
    void popover.hide();
  };
}
