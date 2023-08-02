/**
 * Styled <dl>, <dt> and <dd> for displaying data
 * as a list of key-value pair.
 *
 * Usage example:
 * ```ts
 * <btrix-desc-list>
 *   <btrix-desc-list-item label="Color">
 *     Red
 *   </btrix-desc-list-item>
 *   <btrix-desc-list-item label="Size">
 *     Large
 *   </btrix-desc-list-item>
 * </btrix-desc-list>
 * ```
 */
import { LitElement, html, css } from "lit";
import { property, queryAssignedElements } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

export class DescListItem extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    dt {
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
      line-height: 1rem;
      margin: var(--sl-spacing-3x-small) 0;
    }

    dd {
      margin: 0;
      padding: 0;
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-medium);
      font-family: var(--font-monostyle-family);
      font-variation-settings: var(--font-monostyle-variation);
      line-height: 1rem;
    }

    .item {
      display: flex;
      justify-content: var(--justify-item, initial);
      border-right: var(--border-right, 0px);
    }
  `;

  @property({ type: String })
  label: string = "";

  render() {
    return html`<div class="item">
      <div class="content">
        <dt>${this.label}</dt>
        <dd><slot></slot></dd>
      </div>
    </div>`;
  }
}

export class DescList extends LitElement {
  static styles = css`
    dl {
      display: grid;
      margin: 0;
    }

    .vertical {
      grid-template-columns: 100%;
      gap: 1rem;
    }

    .horizontal {
      grid-auto-flow: column;
    }
  `;

  @property({ type: Boolean })
  horizontal = false;

  render() {
    return html`<dl
      class=${classMap({
        vertical: !this.horizontal,
        horizontal: this.horizontal,
      })}
    >
      <slot @slotchange=${this.handleSlotchange}></slot>
    </dl>`;
  }

  @queryAssignedElements({ selector: "btrix-desc-list-item" })
  private listItems!: Array<HTMLElement>;

  private handleSlotchange() {
    if (this.horizontal) {
      // Style children
      this.listItems.map((el, i, arr) => {
        let style = "--justify-item: center;";
        if (i < arr.length - 1) {
          style = `${style} --border-right: 1px solid var(--sl-panel-border-color);`;
        }
        el.setAttribute("style", style);
      });
    }
  }
}
