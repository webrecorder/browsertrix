/* eslint-disable lit/binding-positions */
/* eslint-disable lit/no-invalid-html */
import clsx from "clsx";
import { css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { html, literal } from "lit/static-html.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

type VariantColor = "primary" | "danger" | "neutral";
type Variant = VariantColor | `${VariantColor}Filled`;

/**
 * Custom styled button
 *
 * Usage example:
 * ```ts
 * <btrix-button>Click me</btrix-button>
 * ```
 */
@customElement("btrix-button")
export class Button extends TailwindElement {
  @property({ type: String })
  type: "submit" | "button" = "button";

  @property({ type: String })
  variant: Variant = "neutral";

  @property({ type: Boolean })
  outlined = false;

  @property({ type: String })
  size: "small" | "medium" = "medium";

  @property({ type: String })
  label?: string;

  @property({ type: String })
  href?: string;

  @property({ type: Boolean })
  raised = false;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  loading = false;

  @property({ type: Boolean })
  icon = false;

  static styles = css`
    :host {
      display: inline-block;
    }

    ::slotted(sl-icon) {
      display: block;
      font-size: 1rem;
    }
  `;

  render() {
    const tag = this.href ? literal`a` : literal`button`;
    return html`<${tag}
      type=${this.type === "submit" ? "submit" : "button"}
      class=${clsx(
        tw`flex h-6 cursor-pointer items-center justify-center gap-2 text-center font-medium outline-3 outline-offset-1 outline-primary transition focus-visible:outline disabled:cursor-not-allowed disabled:text-neutral-300`,
        this.icon
          ? clsx(
              `rounded-md`,
              this.size === "medium"
                ? tw`min-h-8 min-w-8 px-1`
                : tw`min-h-6 min-w-6`,
            )
          : tw`h-6 rounded-sm px-2`,
        this.raised && tw`shadow-sm`,
        this.outlined && tw`border`,
        {
          primary: tw` border-primary-300 bg-blue-50 text-primary-600 shadow-primary-800/20 hover:bg-primary-100`,
          danger: tw`shadow-danger-800/20 border-danger-300 bg-danger-50 text-danger-600 hover:bg-danger-100`,
          neutral: tw`border-gray-300 text-gray-600 hover:text-primary-600`,
          primaryFilled: tw`border-primary-800 bg-primary-500 text-white shadow-primary-800/20`,
          dangerFilled: tw`shadow-danger-800/20 border-danger-800 bg-danger-500 text-white`,
          neutralFilled: tw`border-gray-800 bg-gray-500 text-white shadow-gray-800/20`,
        }[this.variant],
      )}
      ?disabled=${this.disabled}
      href=${ifDefined(this.href)}
      aria-label=${ifDefined(this.label)}
      @click=${this.handleClick}
    >
      ${this.loading ? html`<sl-spinner></sl-spinner>` : html`<slot></slot>`}
    </${tag}>`;
  }

  private handleClick(e: MouseEvent) {
    if (this.disabled || this.loading) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (this.type === "submit") {
      this.submit();
    }
  }

  private submit() {
    const form = this.closest("form");

    if (form) {
      form.submit();
    }
  }
}
