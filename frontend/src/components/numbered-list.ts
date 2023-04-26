import { LitElement, html, css } from "lit";
import { property, queryAssignedElements } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

type ListItem = {
  order?: number;
  style?: string; // inline styles
  content: any; // any lit template content
};

export class NumberedListItem extends LitElement {
  @property({ type: Boolean })
  isFirst: boolean = false;

  @property({ type: Boolean })
  isLast: boolean = false;

  @property({ type: Boolean })
  isEven: boolean = false;

  static styles = css`
    :host,
    .item {
      display: contents;
    }

    .content {
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

    .marker {
      color: var(--sl-color-neutral-400);
      line-height: 1;
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      text-align: right;
      white-space: nowrap;
    }

    .item.first .content {
      border-top: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-top-left-radius: var(--sl-border-radius-medium);
      border-top-right-radius: var(--sl-border-radius-medium);
    }

    .item.last .content {
      border-bottom: var(--sl-panel-border-width) solid
        var(--sl-panel-border-color);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
    }

    .item.even .content {
      background-color: var(--sl-color-neutral-50); */
    }
  `;

  render() {
    return html`
      <div
        class=${classMap({
          item: true,
          first: this.isFirst,
          last: this.isLast,
          even: this.isEven,
        })}
      >
        <div class="marker"><slot name="marker"></slot></div>
        <div class="content"><slot></slot></div>
      </div>
    `;
  }
}

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

  static styles = css`
    :host {
      display: block;
    }

    .list {
      display: grid;
      grid-template-columns: minmax(3ch, max-content) 1fr;
      grid-column-gap: var(--sl-spacing-x-small);
      align-items: center;
      font-family: var(--sl-font-mono);
      list-style-type: none;
      margin: 0;
      padding: 0;
    }
  `;

  @queryAssignedElements({ selector: "btrix-numbered-list-item" })
  listItems!: NumberedListItem[];

  render() {
    return html`
      <ol class="list">
        <slot @slotchange=${this.handleSlotchange}></slot>
      </ol>
    `;
  }

  private handleSlotchange() {
    this.listItems.forEach((el, i) => {
      if (!el.attributes.getNamedItem("role")) {
        el.setAttribute("role", "listitem");
      }
      el.isFirst = i === 0;
      el.isLast = i === this.listItems.length - 1;
      el.isEven = i % 2 !== 0;
    });
  }
}
