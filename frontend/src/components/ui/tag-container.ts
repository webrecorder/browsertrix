import clsx from "clsx";
import { css, html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import debounce from "lodash/fp/debounce";

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
@customElement("btrix-tag-container")
export class TagContainer extends TailwindElement {
  static styles = css`
    :host {
      --width: 100%;
    }
  `;

  @property({ type: Array })
  tags: string[] = [];

  @query("#container")
  private readonly container?: HTMLElement | null;

  @queryAll("btrix-tag")
  private readonly tagNodes!: NodeListOf<Tag>;

  @state()
  private displayLimit?: number;

  disconnectedCallback(): void {
    this.debouncedCalculate.cancel();
    super.disconnectedCallback();
  }

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.get("tags")) {
      this.debouncedCalculate.cancel();
      this.calculate();
    }
  }

  render() {
    const maxTags = this.tags.length;
    const displayLimit = this.displayLimit;
    const remainder = displayLimit && maxTags - displayLimit;

    return html`
      <sl-resize-observer
        @sl-resize=${this.debouncedCalculate as UnderlyingFunction<
          typeof this.calculate
        >}
      >
        <div class="flex items-center">
          <div
            id="container"
            class="flex h-6 w-[var(--width)] flex-wrap gap-x-1.5 overflow-hidden contain-content"
          >
            ${this.tags.map(
              (tag, i) =>
                html`<btrix-tag
                  aria-hidden=${ifDefined(
                    displayLimit === undefined
                      ? undefined
                      : i > displayLimit - 1
                        ? "true"
                        : "false",
                  )}
                  >${tag}</btrix-tag
                >`,
            )}
          </div>

          <btrix-popover hoist placement="right">
            <btrix-badge
              variant="text"
              size="large"
              class=${clsx(!remainder && tw`invisible`)}
              aria-hidden=${remainder ? "false" : "true"}
              tabIndex="0"
              >+${localize.number(remainder || maxTags)}</btrix-badge
            >
            <div slot="content" class="z-50 flex flex-wrap gap-1.5">
              ${this.tags
                .slice(displayLimit)
                .map((tag) => html`<btrix-tag>${tag}</btrix-tag>`)}
            </div>
          </btrix-popover>
        </div>
      </sl-resize-observer>
    `;
  }

  private readonly calculate = () => {
    const tagNodes = Array.from(this.tagNodes);

    if (!tagNodes.length || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const containerTop = containerRect.top;

    // Reset width
    this.style.setProperty("--width", "100%");
    const idx = tagNodes.findIndex(
      (el) => el.getBoundingClientRect().top > containerTop,
    );

    if (idx === -1) return;
    const lastVisible = tagNodes[idx - 1];
    if (lastVisible as unknown) {
      const rect = lastVisible.getBoundingClientRect();
      // Decrease width of container to match end of last visible tag
      this.style.setProperty(
        "--width",
        `${rect.left - containerRect.left + rect.width}px`,
      );
    }

    this.displayLimit = idx;
  };

  private readonly debouncedCalculate = debounce(50)(this.calculate);
}
