import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

/**
 * Button with single icon.
 * Icons names from https://shoelace.style/components/icon
 *
 * Usage example:
 * ```ts
 * <btrix-icon-button name="plus-lg"></btrix-icon-button>
 * ```
 */
export class IconButton extends LitElement {
  @property({ type: String })
  name: string = "square";

  @property({ type: String })
  type: "submit" | "button" = "button";

  @property({ type: String })
  variant: "primary" | "danger" | "neutral" = "neutral";

  @property({ type: Boolean })
  disabled: boolean = false;

  @property({ type: Boolean })
  loading: boolean = false;

  static styles = css`
    :host {
      display: inline-block;
    }

    button {
      all: unset;
      display: block;
      width: 1.5rem;
      height: 1.5rem;
      padding: 0.25rem;
      border-radius: var(--sl-border-radius-small);
      box-sizing: border-box;
      text-align: center;
      cursor: pointer;
      transform: translateY(0px);
      transition: background-color 0.15s, box-shadow 0.15s, color 0.15s,
        transform 0.15s;
    }

    button[disabled] {
      cursor: not-allowed;
      background-color: var(--sl-color-neutral-100) !important;
      color: var(--sl-color-neutral-300) !important;
    }

    sl-icon {
      display: block;
      font-size: 1rem;
    }

    .primary,
    .danger {
      box-shadow: var(--sl-shadow-x-small);
    }

    .primary:not([disabled]):hover,
    .dangery:not([disabled]):hover {
      box-shadow: 0px 0px 1px rgba(0, 0, 0, 0.1);
      transform: translateY(1px);
    }

    .primary {
      background-color: var(--sl-color-blue-50);
      color: var(--sl-color-blue-600);
    }

    .primary:hover {
      background-color: var(--sl-color-blue-100);
    }

    .danger {
      background-color: var(--sl-color-danger-50);
      color: var(--sl-color-danger-600);
    }

    .danger:hover {
      background-color: var(--sl-color-danger-100);
    }

    .neutral {
      color: var(--sl-color-neutral-500);
    }

    .neutral:hover {
      color: var(--sl-color-blue-500);
    }
  `;

  render() {
    return html`<button
      type="submit"
      class=${this.variant}
      ?disabled=${this.disabled}
      @click=${this.handleClick}
    >
      ${this.loading
        ? html`<sl-spinner></sl-spinner>`
        : html`<sl-icon name=${this.name}></sl-icon>`}
    </button>`;
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
      this.closest("sl-form")) as HTMLFormElement;

    if (form) {
      form.submit();
    }
  }
}
