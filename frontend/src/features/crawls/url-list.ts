import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { FloatingPopover } from "@/components/ui/floating-popover";
import { ClipboardController } from "@/controllers/clipboard";
import type { Seed } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

/**
 * Crawls can have many seed URLs (input) or page URLs (output).
 *
 * URLs can be styled based on an include or exclude match condition.
 *
 * @cssPart row
 * @cssPart order
 * @cssPart order-match
 * @cssPart order-exclude
 * @cssPart row
 * @cssPart row-match
 * @cssPart row-exclude
 * @cssPart url
 * @cssPart url-match
 * @cssPart url-exclude
 * @cssProperty --btrix-row-bg-color
 * @cssProperty --btrix-row-hover-bg-color
 * @cssProperty --btrix-row-hover-border-color
 */
@customElement("btrix-url-list")
@localized()
export class UrlList extends TailwindElement {
  static styles = css`
    btrix-table-body {
      white-space: nowrap;
    }

    btrix-table-row:hover,
    btrix-table-row:focus-within {
      z-index: 9;
    }

    btrix-table-cell,
    btrix-code {
      overflow: hidden;
    }

    .bordered btrix-table-body {
      padding-top: 1px;
    }

    .bordered btrix-table-row {
      margin-top: -1px;
    }

    .bordered btrix-table-cell:not(.url-order) {
      border-top: 1px solid transparent;
      border-bottom: 1px solid transparent;
    }

    .bordered btrix-table-row:first-of-type btrix-table-cell:not(.url-order) {
      border-top-color: var(--sl-panel-border-color);
      border-top-left-radius: var(--sl-border-radius-medium);
      border-top-right-radius: var(--sl-border-radius-medium);
    }

    .bordered btrix-table-row:last-of-type btrix-table-cell:not(.url-order) {
      border-bottom-color: var(--sl-panel-border-color);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
    }

    .bordered
      btrix-table-row:has(.url-control:hover)
      btrix-table-cell:not(.url-order) {
      border-top: 1px solid var(--row-hover-border-color);
      border-bottom: 1px solid var(--row-hover-border-color);
    }

    .bordered
      btrix-table-row:has(.url-control:hover)
      btrix-table-cell:first-of-type:not(.url-order),
    .bordered
      btrix-table-row:has(.url-control:hover)
      .url-order
      + btrix-table-cell {
      border-left-color: var(--row-hover-border-color);
    }

    .bordered
      btrix-table-row:has(.url-control:hover)
      btrix-table-cell:last-of-type {
      border-right-color: var(--row-hover-border-color);
    }

    .bordered btrix-table-cell:first-of-type:not(.url-order),
    .bordered .url-order + btrix-table-cell {
      border-left: 1px solid var(--sl-panel-border-color);
    }

    .bordered btrix-table-cell:last-of-type {
      border-right: 1px solid var(--sl-panel-border-color);
    }

    .no-border btrix-table-cell:not(.url-order) {
      border-radius: var(--sl-border-radius-small);
    }

    btrix-overflow-scroll::part(content) {
      padding-inline-start: var(--sl-spacing-2x-small);
    }

    btrix-table-row {
      --row-hover-border-color: var(
        --btrix-row-hover-border-color,
        var(--sl-color-primary-100)
      );
      --row-bg-color: var(--btrix-row-bg-color);
    }

    btrix-table-row:nth-of-type(even) {
      --row-bg-color: var(--btrix-row-bg-color, var(--sl-color-neutral-50));
    }

    btrix-table-row:has(.url-control:hover) {
      --row-bg-color: var(
        --btrix-row-hover-bg-color,
        var(--sl-color-primary-50)
      );
    }

    btrix-table-cell:not(.url-order) {
      --btrix-overflow-scroll-scrim-color: var(--row-bg-color);
      background-color: var(--row-bg-color);
    }

    btrix-overflow-scroll {
      --btrix-overflow-scroll-thumb-color: var(--sl-color-neutral-300);
      --btrix-overflow-scroll-track-color: transparent;
      width: 100%;
      contain: inline-size;
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
   * Style with border
   */
  @property({ type: Boolean, noAccessor: true })
  border = false;

  /**
   * Offset ordered list
   */
  @property({ type: Number })
  offset = 1;

  /**
   * Include function
   */
  @property({ noAccessor: true })
  includeUrl?: (url: string) => boolean;

  /**
   * Exclude function
   */
  @property({ noAccessor: true })
  excludeUrl?: (url: string) => boolean;

  private readonly clipboardController = new ClipboardController(this, {
    timeout: 10 * 1000,
  });

  render() {
    if (!this.urls?.length) return;

    const seedToUrl = (seedOrUrl: string | Seed) =>
      typeof seedOrUrl === "string" ? seedOrUrl : seedOrUrl.url;

    return html`<btrix-table
      class=${clsx(
        tw`text-[0.8125rem]`,
        this.ordered
          ? tw`grid-cols-[min-content_1fr_auto]`
          : tw`grid-cols-[1fr_auto]`,
        this.border ? "bordered" : "no-border",
      )}
    >
      <btrix-table-body>
        ${repeat(this.urls, seedToUrl, (seedOrUrl, idx) => {
          const url = seedToUrl(seedOrUrl);
          const match = this.includeUrl?.(url);
          const exclude = this.excludeUrl?.(url);

          return html`
            <btrix-table-row
              part=${clsx(
                "row",
                match && "row-match",
                exclude && "row-exclude",
              )}
            >
              ${this.ordered
                ? html`
                    <btrix-table-cell
                      class="url-order"
                      part=${clsx(
                        "order",
                        match && "order-match",
                        exclude && "order-exclude",
                      )}
                      >${idx + this.offset}.</btrix-table-cell
                    >
                  `
                : nothing}
              <btrix-table-cell>
                <btrix-floating-popover hoist>
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
                    class="url-control cursor-pointer"
                    hideScrollbar
                    @mousedown=${this.onUrlMouseDown}
                    @mouseup=${this.onUrlMouseUp}
                    @mouseenter=${this.onUrlMouseEnter}
                    @click=${(e: MouseEvent) => {
                      const selection = window.getSelection()?.toString();

                      if (selection) {
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
                        void this.clipboardController.copy(selection);
                        void popover.show();
                      } else {
                        // Copy entire URL
                        void this.clipboardController.copy(url);
                      }
                    }}
                  >
                    <btrix-code
                      part=${clsx(
                        "url",
                        match && "url-match",
                        exclude && "url-exclude",
                      )}
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
                      rel="noopener noreferrer nofollow"
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
   * Rudimentary implementation of `selectstart`, which is handled differently
   * between browsers. See https://issues.chromium.org/issues/40718667
   */
  private readonly onUrlMouseMove = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const popover = el.closest<FloatingPopover>("btrix-floating-popover");

    if (!popover) {
      console.debug("no popover");
      return;
    }

    const selection = window.getSelection()?.toString();

    if (selection) {
      void popover.hide();
    }
  };

  /**
   * Disable mouseover on floating popover
   */
  private readonly onUrlMouseDown = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement;

    el.addEventListener("mouseover", this.overrideUrlMouseOver);
    el.addEventListener("mousemove", this.onUrlMouseMove);
  };

  /**
   * Enable mouseover on floating popover
   */
  private readonly onUrlMouseUp = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement;

    el.removeEventListener("mouseover", this.overrideUrlMouseOver);
    el.removeEventListener("mousemove", this.onUrlMouseMove);
  };
}
