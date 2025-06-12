/* eslint-disable lit/binding-positions */
/* eslint-disable lit/no-invalid-html */
import clsx from "clsx";
import { css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { html, literal } from "lit/static-html.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

type Variant = "neutral" | "danger";

/**
 * Custom styled button.
 */
@customElement("btrix-button")
export class Button extends TailwindElement {
  @property({ type: String })
  type: "submit" | "button" = "button";

  // TODO unify button styling & variants - there are probably a few different
  // approaches for difference button use cases, but we'll figure that out in
  // the future when we work more on our UI library.
  // See also https://github.com/webrecorder/browsertrix/issues/1550
  @property({ type: String })
  variant: Variant = "neutral";

  @property({ type: Boolean })
  filled = false;

  @property({ type: String })
  size: "x-small" | "small" | "medium" = "medium";

  @property({ type: String })
  label?: string;

  @property({ type: String })
  href?: string;

  @property({ type: String })
  download?: string;

  @property({ type: Boolean })
  raised = false;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  loading = false;

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
        this.disabled ? tw`cursor-not-allowed opacity-50` : tw`cursor-pointer`,
        tw`flex items-center justify-center gap-2 text-center font-medium outline-3 outline-offset-1 outline-primary transition focus-visible:outline`,
        {
          "x-small": tw`min-h-4 min-w-4 text-sm`,
          small: tw`min-h-6 min-w-6 rounded-md text-base`,
          medium: tw`min-h-8 min-w-8 rounded-sm text-lg`,
        }[this.size],
        this.raised && [
          tw`shadow ring-1 ring-stone-500/20`,
          !this.disabled &&
            tw`hover:shadow-stone-800/20 hover:ring-stone-800/20`,
        ],
        this.filled
          ? [
              tw`text-white`,
              {
                neutral: [
                  tw`border-primary-800 bg-primary-500 shadow-primary-800/20`,
                  !this.disabled && tw`hover:bg-primary-600`,
                ],
                danger: [
                  tw`shadow-danger-800/20 border-danger-800 bg-danger-500`,
                  !this.disabled && tw`hover:bg-danger-600`,
                ],
              }[this.variant],
            ]
          : [
              this.raised && tw`bg-white`,
              {
                neutral: [
                  tw`border-gray-300 text-gray-600`,
                  !this.disabled && tw`hover:text-primary-500`,
                ],
                danger: [
                  tw`shadow-danger-800/20 border-danger-300 bg-danger-50 text-danger-600`,
                  !this.disabled && tw`hover:bg-danger-100`,
                ],
              }[this.variant],
            ],
      )}
      ?disabled=${this.disabled}
      href=${ifDefined(this.href)}
      download=${ifDefined(this.download)}
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
