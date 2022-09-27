import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
// import LiteElement, { html } from "../utils/LiteElement";

/**
 * Styled numbered list
 *
 * Usage example:
 * ```ts
 * <btrix-numbered-list></btrix-numbered-list>
 * ```
 */
export class NumberedList extends LitElement {
  @property({ type: Array })
  items: any[] = [];

  static styles = css`
    :host {
      display: block;
    }

    ol {
      font-family: var(--sl-font-mono);
      line-height: 1;
    }

    li {
      border-left: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-right: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      padding: var(--sl-spacing-x-small);
    }

    li:first-child {
      border-top: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-top-left-radius: var(--sl-border-radius-medium);
      border-top-right-radius: var(--sl-border-radius-medium);
    }

    li:last-child {
      border-bottom: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
    }

    li:nth-child(even) {
      background-color: var(--sl-color-neutral-50);
    }

    li::marker {
      color: var(--sl-color-neutral-500);
    }
  `;

  render() {
    return html`
      <ol>
        ${this.items.map((item) => html` <li>${item}</li> `)}
      </ol>
    `;
  }
}
