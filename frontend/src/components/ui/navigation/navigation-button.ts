/* eslint-disable lit/binding-positions */
/* eslint-disable lit/no-invalid-html */
import clsx from "clsx";
import { css, type PropertyValueMap } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { html, literal } from "lit/static-html.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * Custom styled button with active state
 *
 * Usage example:
 * ```ts
 * <btrix-navigation-button>Click me</btrix-navigation-button>
 * ```
 *
 * @exportparts button
 */
@customElement("btrix-navigation-button")
export class NavigationButton extends TailwindElement {
  @property({ type: Boolean })
  active = false;

  @property({ type: String })
  type: "submit" | "button" = "button";

  @property({ type: String })
  variant: "primary" | "error" = "primary"; // TODO expand if necessary

  @property({ type: String })
  label?: string;

  @property({ type: String })
  href?: string;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  icon = false;

  @property({ type: String, reflect: true })
  role: ARIAMixin["role"] = null;

  @property({ type: String })
  size: "small" | "medium" | "large" = "medium";

  @property({ type: String })
  align: "left" | "center" | "right" = "left";

  connectedCallback(): void {
    if (!this.role && !this.href) {
      this.role = "tab";
    }
    super.connectedCallback();
  }

  protected willUpdate(changedProperties: PropertyValueMap<this>) {
    if (changedProperties.has("active")) {
      this.ariaSelected = this.active ? "true" : null;
    }
  }

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
      part="button"
      class=${clsx([
        tw`flex w-full cursor-pointer items-center gap-2 rounded font-medium leading-[16px] transition hover:transition-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-50`,

        this.icon ? tw`min-h-6 min-w-6` : tw``,
        {
          small: this.icon ? tw`min-h-6 p-0` : tw`min-h-6 px-2 py-0`,
          medium: tw`p-2`,
          large: tw`px-2 py-4`,
        }[this.size],
        {
          left: "justify-start",
          center: "justify-center",
          right: "justify-end",
        }[this.align],
        this.active && "shadow-sm",
        {
          primary: [
            tw`outline-primary-600`,
            this.active
              ? tw`bg-primary-100/80 text-primary-800 shadow-primary-900/20`
              : tw`bg-white/80 text-neutral-700 outline-primary-100/80 hover:bg-primary-50`,
          ],
          error: [
            tw`outline-red-600`,
            this.active
              ? tw`bg-red-100/80 text-red-800 shadow-red-900/20`
              : tw`bg-white/80 text-red-700 ring-1 ring-red-300 hover:bg-red-50`,
          ],
        }[this.variant],
      ])}
      ?disabled=${this.disabled}
      href=${ifDefined(this.href)}
      aria-label=${ifDefined(this.label)}
      @click=${this.handleClick}

    >
      <slot></slot>
    </${tag}>`;
  }

  private handleClick(e: MouseEvent) {
    if (this.disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (this.type === "submit") {
      this.closest("form")?.submit();
    }
  }
}
