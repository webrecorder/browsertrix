/* eslint-disable lit/binding-positions */
/* eslint-disable lit/no-invalid-html */
import { css } from "lit";
import { html, literal } from "lit/static-html.js";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { TailwindElement } from "@/classes/TailwindElement";

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
  variant: "primary" | "danger" | "neutral" = "neutral";

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
      class=${[
        "flex gap-2 items-center justify-center rounded-sm font-medium text-center cursor-pointer transition-all disabled:cursor-not-allowed disabled:text-neutral-300 h-6",
        this.icon ? "min-w-6 min-h-6 px-1" : "h-6 px-2",
        this.raised ? "shadow-sm" : "",
        {
          primary:
            "bg-blue-50 text-blue-600 hover:bg-blue-100 shadow-blue-800/20",
          danger:
            "bg-danger-50 text-danger-600 hover:bg-danger-100 shadow-danger-800/20",
          neutral: "text-neutral-600 hover:text-blue-600",
        }[this.variant],
      ]
        .filter(Boolean)
        .join(" ")}
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
    const form = (this.closest("form") || this.closest("form"))!;

    if (form) {
      form.submit();
    }
  }
}
