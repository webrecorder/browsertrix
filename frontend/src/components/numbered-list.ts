import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

type ListItem = {
  content: any; // any lit template content
};

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
  items: ListItem[] = [];

  @property({ type: Object })
  innerStyle?: any;

  static styles = css`
    :host {
      display: block;
    }

    ol {
      font-family: var(--sl-font-mono);
      line-height: 1.1;
    }

    li {
      border-left: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-right: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
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
      color: var(--sl-color-neutral-400);
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
    }

    a {
      color: var(--sl-color-indigo-500);
      text-decoration: none;
    }

    a:hover {
      color: var(--sl-color-indigo-400);
    }
  `;

  render() {
    return html`
      <ol>
        ${this.items.map((item) => html` <li>${item.content}</li> `)}
      </ol>

      ${this.innerStyle}
    `;
  }
}
