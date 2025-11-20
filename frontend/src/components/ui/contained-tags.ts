import clsx from "clsx";
import { css, html } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";
import debounce from "lodash/fp/debounce";

import type { Popover } from "./popover";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Tag } from "@/components/ui/tag";
import type { UnderlyingFunction } from "@/types/utils";
import localize from "@/utils/localize";
import { tw } from "@/utils/tailwind";

/**
 * Displays all the tags that can be contained to one line.
 * Overflowing tags are displayed in a popover.
 *
 * @cssproperty width
 */
@customElement("btrix-contained-tags")
export class ContainedTags extends TailwindElement {
  static styles = css`
    :host {
      --width: 100%;
    }
  `;

  /**
   * Maximum number of possible tags.
   * This number is used to preserve space for the remainder badge
   * when calculating width after line clamping.
   */
  @property({ type: Number })
  maxTags = 100;

  @query("#container")
  private readonly container?: HTMLElement | null;

  @query("btrix-popover")
  private readonly remainderPopover?: Popover | null;

  @queryAssignedElements()
  private readonly tags!: Tag[];

  @state()
  public remainder?: number;

  #popoverContent?: HTMLElement;

  disconnectedCallback(): void {
    this.debouncedCalculate.cancel();
    super.disconnectedCallback();
  }

  render() {
    return html`
      <sl-resize-observer
        @sl-resize=${this.debouncedCalculate as UnderlyingFunction<
          typeof this.calculate
        >}
      >
        <div class="flex items-center gap-2">
          <div
            id="container"
            class="flex h-6 w-[var(--width)] flex-wrap gap-x-1.5 overflow-hidden contain-content"
          >
            <slot
              @slotchange=${() => {
                this.debouncedCalculate.cancel();
                this.calculate();
              }}
            ></slot>
          </div>

          <btrix-popover hoist placement="right">
            <btrix-badge
              variant="blue"
              class=${clsx(!this.remainder && tw`invisible`)}
              aria-hidden=${this.remainder ? "false" : "true"}
              >+${localize.number(this.remainder || this.maxTags)}</btrix-badge
            >
          </btrix-popover>
        </div>
      </sl-resize-observer>
    `;
  }

  private readonly calculate = () => {
    if (!this.tags.length || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const containerTop = containerRect.top;

    // Reset width
    this.style.setProperty("--width", "100%");

    const idx = this.tags.findIndex(
      (el) => el.getBoundingClientRect().top > containerTop,
    );

    if (idx === -1) return;

    const lastVisible = this.tags[idx - 1];

    if (lastVisible as unknown) {
      const rect = lastVisible.getBoundingClientRect();

      // Decrease width of container to match end of last visible tag
      this.style.setProperty(
        "--width",
        `${rect.left - containerRect.left + rect.width}px`,
      );
    }

    // Clone remaining elements into popover
    const remaining = this.tags.slice(idx);
    const popoverContent = document.createElement("div");

    popoverContent.classList.add(
      tw`flex`,
      tw`flex-wrap`,
      tw`gap-1.5`,
      tw`z-50`,
    );
    popoverContent.setAttribute("slot", "content");

    remaining.forEach((el) => {
      popoverContent.appendChild(el.cloneNode(true));
    });

    this.remainder = remaining.length;

    if (this.#popoverContent) {
      this.remainderPopover?.removeChild(this.#popoverContent);
    }
    if (this.remainder) {
      this.remainderPopover?.appendChild(popoverContent);
    }
    this.#popoverContent = popoverContent;
  };

  private readonly debouncedCalculate = debounce(50)(this.calculate);
}
