/* eslint-disable lit/binding-positions */
/* eslint-disable lit/no-invalid-html */
import { LitElement, css } from "lit";
import { html, literal } from "lit/static-html.js";
import { property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";

/**
 * Custom styled button
 *
 * Usage example:
 * ```ts
 * <btrix-button>Click me</btrix-button>
 * ```
 */
export class Button extends LitElement {
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
  disabled: boolean = false;

  @property({ type: Boolean })
  loading: boolean = false;

  @property({ type: Boolean })
  icon: boolean = false;

  static styles = css`
    :host {
      display: inline-block;
    }

    ::slotted(sl-icon) {
      display: block;
      font-size: 1rem;
    }

    .button {
      all: unset;
      display: flex;
      gap: var(--sl-spacing-x-small);
      align-items: center;
      justify-content: center;
      border-radius: var(--sl-border-radius-small);
      box-sizing: border-box;
      font-weight: 500;
      text-align: center;
      cursor: pointer;
      transform: translateY(0px);
      transition: background-color 0.15s, box-shadow 0.15s, color 0.15s,
        transform 0.15s;
    }

    .button[disabled] {
      cursor: not-allowed;
      background-color: var(--sl-color-neutral-100) !important;
      color: var(--sl-color-neutral-300) !important;
    }

    .button.icon {
      min-width: 1.5rem;
      min-height: 1.5rem;
      padding: 0 var(--sl-spacing-2x-small);
    }

    .button:not(.icon) {
      height: var(--sl-input-height-small);
      padding: 0 var(--sl-spacing-x-small);
    }

    .raised {
      box-shadow: var(--sl-shadow-x-small);
    }

    :not([aria-disabled]) .raised:not([disabled]):hover {
      box-shadow: 0px 0px 1px rgba(0, 0, 0, 0.1);
      transform: translateY(1px);
    }

    .primary {
      background-color: var(--sl-color-blue-50);
      color: var(--sl-color-blue-600);
    }

    :not([aria-disabled]) .primary:hover {
      background-color: var(--sl-color-blue-100);
    }

    .danger {
      background-color: var(--sl-color-danger-50);
      color: var(--sl-color-danger-600);
    }

    :not([aria-disabled]) .danger:hover {
      background-color: var(--sl-color-danger-100);
    }

    .neutral {
      color: var(--sl-color-neutral-600);
    }

    .neutral:hover {
      color: var(--sl-color-blue-500);
    }
  `;

  render() {
    const tag = this.href ? literal`a` : literal`button`;
    return html`<${tag}
      type=${this.type === "submit" ? "submit" : "button"}
      class=${classMap({
        button: true,
        [this.variant]: true,
        icon: this.icon,
        raised: this.raised,
      })}
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
    const form = (this.closest("form") ||
      this.closest("form")) as HTMLFormElement;

    if (form) {
      form.submit();
    }
  }
}
