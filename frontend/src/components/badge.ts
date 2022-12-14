import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

/**
 * Show numeric value in a label
 *
 * Usage example:
 * ```ts
 * <btrix-badge aria-describedby="text">10</btrix-badge>
 * ```
 */
export class Badge extends LitElement {
  @property({ type: String })
  variant: "success" | "warning" | "danger" | "neutral" = "neutral";

  static styles = css`
    :host > span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: var(--sl-font-size-x-small);
      line-height: 1.125rem;
      height: 1.125rem;
      padding: 0 0.5rem;
      border-radius: var(--sl-border-radius-small);
      vertical-align: 1px;
    }

    .success {
      background-color: var(--sl-color-success-500);
      color: var(--sl-color-neutral-0);
    }

    .warning {
      background-color: var(--sl-color-warning-600);
      color: var(--sl-color-neutral-0);
    }

    .danger {
      background-color: var(--sl-color-danger-500);
      color: var(--sl-color-neutral-0);
    }

    .neutral {
      background-color: var(--sl-color-neutral-100);
      color: var(--sl-color-neutral-600);
    }
  `;

  render() {
    return html`
      <span class=${this.variant}>
        <slot></slot>
      </span>
    `;
  }
}
