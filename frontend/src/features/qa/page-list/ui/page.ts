import { TailwindElement } from "@/classes/TailwindElement";
import { localized } from "@lit/localize";
import { type PropertyValues, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { type Ref, createRef, ref } from "lit/directives/ref.js";

import { animateTo, shimKeyframesHeightAuto } from "./animate";
import { tw } from "@/utils/tailwind";

@localized()
@customElement("btrix-qa-page")
export class QaPage extends TailwindElement {
  @property({ type: String })
  pageId?: string;

  @property({ type: Boolean, reflect: true })
  selected = false;

  contentContainer: Ref<HTMLElement> = createRef();

  select = () => {
    this.dispatchEvent(
      new CustomEvent<string | undefined>("qa-page-select", {
        detail: this.pageId,
        composed: true,
        bubbles: true,
      }),
    );
    this.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  animateExpand = async () => {
    if (this.contentContainer.value == null) return;
    await animateTo(
      this.contentContainer.value,
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
        this.contentContainer.value.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  animateCollapse = async () => {
    if (this.contentContainer.value == null) return;
    await animateTo(
      this.contentContainer.value,
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
        this.contentContainer.value.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  protected async willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("selected")) {
      if (changedProperties.get("selected")) {
        void this.animateCollapse();
      } else {
        void this.animateExpand();
        this.focus();
      }
    }
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.updateComplete;
    this.contentContainer.value?.classList.add(
      this.selected ? tw`h-auto` : tw`h-0`,
    );
  }

  render() {
    return html`
      <div class="py-2 text-sm text-gray-600">
        <div
          class="relative z-20 ml-4 block flex-auto cursor-pointer select-none overflow-visible rounded border border-solid border-gray-300 bg-white px-4 py-2 pl-5 shadow-sm transition-shadow aria-selected:border-blue-500 aria-selected:bg-blue-50 aria-selected:shadow-md aria-selected:shadow-blue-800/20 aria-selected:transition-none"
          @click=${this.select}
          tabindex="0"
          aria-selected=${this.selected}
        >
          <slot></slot>
        </div>
        <div
          class="${this.selected
            ? "h-auto"
            : "h-0"} overflow-hidden [contain:content] [content-visibility:auto]"
          ${ref(this.contentContainer)}
        >
          <slot name="content"></slot>
        </div>
      </div>
    `;
  }
}
