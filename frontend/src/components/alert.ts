import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

/**
 * Alert used inline, e.g. for form server errors
 *
 * Usage example:
 * ```ts
 * <input aria-describedby="error_message" />
 * <bt-alert id="error_message>${errorMessage}</bt-alert>
 * ```
 */
export class Alert extends LitElement {
  @property({ type: String })
  type: "success" | "warning" | "danger" | "info" = "info";

  static styles = css`
    :host > div {
      padding: var(--sl-spacing-x-small) var(--sl-spacing-small);
      border-radius: var(--sl-border-radius-medium);
    }

    .success {
      background-color: var(--sl-color-success-50);
      color: var(--success);
    }

    .warning {
      background-color: var(--sl-color-warning-50);
      color: var(--warning);
    }

    .danger {
      background-color: var(--sl-color-danger-50);
      color: var(--danger);
    }

    .info {
      background-color: var(--sl-color-sky-50);
      color: var(--sl-color-sky-600);
    }
  `;

  render() {
    console.log("id:", this.id);
    return html`
      <div class="${this.type}" role="alert">
        <slot></slot>
      </div>
    `;
  }
}
