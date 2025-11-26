import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";

@customElement("btrix-link")
export class Link extends BtrixElement {
  @property({ type: String })
  href?: HTMLAnchorElement["href"];

  @property({ type: String })
  target?: HTMLAnchorElement["target"];

  @property({ type: String })
  rel?: HTMLAnchorElement["rel"];

  @property({ type: String })
  variant: "primary" | "neutral" = "neutral";

  @property({ type: Boolean })
  hideIcon = false;

  render() {
    if (!this.href) return;

    return html`
      <a
        class=${clsx(
          "group inline-flex items-center gap-1 transition-colors duration-fast",
          {
            primary: "text-primary-500 hover:text-primary-600",
            neutral: "text-blue-500 hover:text-blue-600",
          }[this.variant],
        )}
        href=${this.href}
        target=${ifDefined(this.target)}
        rel=${ifDefined(this.rel)}
        @click=${this.target === "_blank" || this.href.startsWith("http")
          ? () => {}
          : this.navigate.link}
      >
        <slot></slot>
        ${this.hideIcon
          ? nothing
          : html`
              <sl-icon
                slot="suffix"
                name="arrow-right"
                class="size-4 transition-transform duration-fast group-hover:translate-x-1"
              ></sl-icon>
            `}
      </a>
    `;
  }
}
