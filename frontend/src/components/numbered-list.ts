import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

type ListItem = {
  order?: number;
  style?: string; // inline styles
  content: any; // any lit template content
};

/**
 * Styled numbered list
 *
 * Usage example:
 * ```ts
 * <btrix-numbered-list></btrix-numbered-list>
 * ```
 *
 * CSS variables:
 * ```
 * --marker-color
 * --link-color
 * --link-hover-color
 * ```
 */
export class NumberedList extends LitElement {
  @property({ type: Array })
  items: ListItem[] = [];

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
      --item-height: 1.5rem;
      contain: paint;
      contain-intrinsic-height: auto var(--item-height);
      content-visibility: auto;
      border-left: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-right: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
      line-height: 1;
      min-height: var(--item-height);
      box-sizing: border-box;
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
      color: var(--marker-color, var(--sl-color-neutral-400));
      line-height: 1;
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      text-align: right;
      margin-right: var(--sl-spacing-x-small);
      white-space: nowrap;
    }

    a {
      color: var(--link-color, var(--sl-color-indigo-500));
      text-decoration: none;
    }

    a:hover {
      color: var(--link-hover-color, var(--sl-color-indigo-400));
    }
  `;

  render() {
    return html`
      <ol class="list">
        ${this.items.map(
          (item, idx) =>
            html`
              <li style=${ifDefined(item.style)}>
                <div class="item-marker">${item.order || idx + 1}.</div>
                <div class="item-content">${item.content}</div>
              </li>
            `
        )}
      </ol>
    `;
  }
}
