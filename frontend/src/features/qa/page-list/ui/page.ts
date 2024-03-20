import { localized } from "@lit/localize";
import { css, html, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import { animateTo, shimKeyframesHeightAuto } from "./animate";

import { TailwindElement } from "@/classes/TailwindElement";

@localized()
@customElement("btrix-qa-page")
export class QaPage extends TailwindElement {
  static styles = css`
    :host {
      /* Chrome-only, improve render perf of long page lists */
      content-visibility: auto;
    }
  `;

  @property({ type: String })
  pageId?: string;

  @property({ type: Boolean })
  selected = false;

  @query(".anchor")
  anchor?: HTMLElement;

  @query(".contentContainer")
  contentContainer?: HTMLElement;

  private select = async () => {
    if (this.selected) return;

    this.dispatchEvent(
      new CustomEvent<string>("btrix-qa-page-select", {
        detail: this.pageId,
        composed: true,
        bubbles: true,
      }),
    );
    await this.animateExpand();
    this.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  private animateExpand = async () => {
    if (!this.contentContainer) return;
    await animateTo(
      this.contentContainer,
      shimKeyframesHeightAuto(
        [
          {
            height: "0",
            opacity: "0",
            overflow: "hidden",
            transform: `translateY(-2px)`,
          },
          {
            height: "auto",
            opacity: "1",
            overflow: "hidden",
            transform: `translateY(0)`,
          },
        ],
        this.contentContainer.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  private animateCollapse = async () => {
    if (!this.contentContainer) return;
    await animateTo(
      this.contentContainer,
      shimKeyframesHeightAuto(
        [
          {
            height: "auto",
            opacity: "1",
            overflow: "hidden",
            transform: `translateY(0)`,
          },
          {
            height: "0",
            opacity: "0",
            overflow: "hidden",
            transform: `translateY(-2px)`,
          },
        ],
        this.contentContainer.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  protected async firstUpdated() {
    if (this.selected) {
      this.anchor?.focus();
      this.scrollIntoView();
    }
  }

  protected async updated(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has("selected") &&
      changedProperties.get("selected") === true &&
      this.selected === false
    ) {
      // Close if deselected
      void this.animateCollapse();
    }
  }

  render() {
    return html`
      <div class="py-2 text-sm text-gray-600">
        <div
          class="anchor relative z-20 ml-4 block flex-auto cursor-pointer select-none overflow-visible rounded border border-solid border-gray-300 bg-white px-4 py-2 pl-5 shadow-sm outline-none transition-shadow  aria-selected:border-blue-500 aria-selected:bg-blue-50 aria-selected:shadow-md aria-selected:shadow-blue-800/20 aria-selected:transition-none"
          @click=${this.select}
          tabindex="0"
          aria-selected=${this.selected}
        >
          <slot></slot>
        </div>
        <div
          class="contentContainer ${this.selected
            ? "h-auto"
            : "h-0"} overflow-hidden [contain:content] [content-visibility:auto]"
        >
          <slot name="content"></slot>
        </div>
      </div>
    `;
  }
}
