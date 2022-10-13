import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

type ListItem = {
  order?: number;
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

    .list {
      display: grid;
      grid-template-columns: minmax(6ch, max-content) 1fr;
      align-items: center;
      font-family: var(--sl-font-mono);
      list-style-type: none;
      margin: 0;
      padding: 0;
    }

    .list li {
      display: contents;
    }

    .item-content {
      border-left: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-right: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
      line-height: 1.25;
    }

    li:first-child .item-content {
      border-top: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-top-left-radius: var(--sl-border-radius-medium);
      border-top-right-radius: var(--sl-border-radius-medium);
    }

    li:last-child .item-content {
      border-bottom: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
    }

    li:nth-child(even) .item-content {
      background-color: var(--sl-color-neutral-50);
    }

    .item-marker {
      color: var(--sl-color-neutral-400);
      line-height: 1;
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      text-align: right;
      margin-right: var(--sl-spacing-x-small);
      white-space: nowrap;
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
      <ol class="list">
        ${this.items.map(
          (item, idx) =>
            html`
              <li>
                <div class="item-marker">${item.order || idx + 1}.</div>
                <div class="item-content">${item.content}</div>
              </li>
            `
        )}
      </ol>

      ${this.innerStyle}
    `;
  }
}
