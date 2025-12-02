import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

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
@customElement("btrix-desc-list-item")
export class DescListItem extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    :host {
      display: contents;
    }

    dt {
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
      line-height: 1rem;
      margin: 0 0 var(--sl-spacing-3x-small) 0;
    }

    dd {
      margin: 0;
      padding: 0 0 var(--sl-spacing-2x-small);
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-medium);
      font-family: var(--font-monostyle-family);
      font-variation-settings: var(--font-monostyle-variation);
      line-height: 1.5rem;
      min-height: 1.5rem;
    }

    .item {
      display: flex;
      justify-content: var(--justify-item, initial);
    }

    .content {
      width: var(--width-full, initial);
    }
  `;

  @property({ type: String })
  label = "";

  render() {
    return html`<div class="item">
      <div class="content">
        <dt>${this.label}<slot name="label"></slot></dt>
        <dd><slot></slot></dd>
      </div>
    </div>`;
  }
}

@customElement("btrix-desc-list")
export class DescList extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    dl {
      display: grid;
      margin: 0;
      gap: var(--sl-spacing-medium);
    }

    .vertical {
      grid-template-columns: 100%;
      --width-full: 100%;
    }

    .horizontal {
      --justify-item: center;
      overflow: hidden;
      display: flex;
      flex-wrap: wrap;
    }

    .horizontal ::slotted(btrix-desc-list-item) {
      position: relative;
      display: inline-block;
      flex: 1 1 auto;
      min-width: min-content;
      padding: var(--sl-spacing-x-small) var(--sl-spacing-medium) 0;
    }

    .horizontal ::slotted(btrix-desc-list-item)::before {
      content: "";
      width: 1px;
      height: 100%;
      top: 0;
      left: -0.5rem;
      position: absolute;
      background-color: var(--sl-panel-border-color);
    }

    .horizontal ::slotted(btrix-desc-list-item)::after {
      content: "";
      height: 1px;
      width: 100%;
      top: -0.5rem;
      left: 0;
      position: absolute;
      background-color: var(--sl-panel-border-color);
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
      part="base"
    >
      <slot></slot>
    </dl>`;
  }
}
