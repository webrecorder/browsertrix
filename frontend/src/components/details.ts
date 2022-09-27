import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

/**
 * Styled <details>
 *
 * Usage example:
 * ```ts
 * <btrix-details></btrix-details>
 * ```
 */
export class Details extends LitElement {
  @property({ type: Boolean })
  open?: false;

  static styles = css`
    :host {
      display: block;
    }

    summary {
      border-bottom: 1px solid var(--sl-panel-border-color);
      color: var(--sl-color-neutral-500);
      padding: var(--sl-spacing-x-small) 0;
      margin-bottom: var(--sl-spacing-x-small);
      line-height: 1;
    }
  `;

  render() {
    return html`
      <details ?open=${this.open}>
        <summary>
          <slot name="summary"></slot>
        </summary>
        <slot></slot>
      </details>
    `;
  }
}
