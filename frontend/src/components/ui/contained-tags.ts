import { css, html, nothing } from "lit";
import {
  customElement,
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
 * Other tags are displayed in a popover.
 */
@customElement("btrix-contained-tags")
export class ContainedTags extends TailwindElement {
  static styles = css`
    :host {
      /* display: contents; */
      outline: 2px solid red;
      --width: 100%;
    }
  `;

  @query("#container")
  private readonly container?: HTMLElement | null;

  @query("btrix-popover")
  private readonly remainderPopover?: Popover | null;

  @queryAssignedElements()
  private readonly tags!: Tag[];

  @state()
  public remainder?: number;

  #popoverContent?: HTMLElement;

  render() {
    return html`
      <sl-resize-observer
        @sl-resize=${this.debouncedCalculate as UnderlyingFunction<
          typeof this.calculate
        >}
      >
        <div class="flex gap-2">
          <div
            id="container"
            class="flex h-6 w-[var(--width)] max-w-[calc(100%-4ch)] flex-wrap gap-x-1.5 overflow-hidden outline"
          >
            <slot @slotchange=${this.calculate}></slot>
          </div>

          ${this.remainder
            ? html`<btrix-popover hoist>
                <btrix-badge>+${localize.number(this.remainder)}</btrix-badge>
              </btrix-popover>`
            : nothing}
        </div>
      </sl-resize-observer>
    `;
  }

  private readonly calculate = async () => {
    if (!this.tags.length || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const containerTop = containerRect.top;

    // Reset width
    this.style.setProperty("--width", "100%");

    const idx = this.tags.findIndex(
      (el) => el.getBoundingClientRect().top > containerTop,
    );

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

    popoverContent.classList.add(tw`flex`, tw`flex-wrap`, tw`gap-1.5`);
    popoverContent.setAttribute("slot", "content");

    remaining.forEach((el) => {
      popoverContent.appendChild(el.cloneNode(true));
    });

    this.remainder = remaining.length;

    await this.updateComplete;

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
