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
import { property } from "lit/decorators.js";

export class DescListItem extends LitElement {
  static styles = css`
    dt {
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
      line-height: 1rem;
    }

    dd {
      margin: 0;
      padding: 0;
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-medium);
      font-family: var(--font-monostyle-family);
      font-variation-settings: var(--font-monostyle-variation);
      line-height: 1.5rem;
    }
  `;

  @property({ type: String })
  label: string = "";

  render() {
    return html`<div>
      <dt>${this.label}</dt>
      <dd><slot></slot></dd>
    </div>`;
  }
}

export class DescList extends LitElement {
  static styles = css`
    dl {
      display: grid;
      grid-template-columns: auto;
      grid-gap: 1rem;
      margin: 0;
    }
  `;

  render() {
    return html`<dl><slot></slot></dl>`;
  }
}
