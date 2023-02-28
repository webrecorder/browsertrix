import { css, html } from "lit";
import SLTag from "@shoelace-style/shoelace/dist/components/tag/tag.js";
import tagStyles from "@shoelace-style/shoelace/dist/components/tag/tag.styles.js";

/**
 * Customized <sl-tag>
 *
 * Usage:
 * ```ts
 * <btrix-tag>Content</btrix-tag>
 * ```
 */
export class Tag extends SLTag {
  static shadowRootOptions = {
    ...SLTag.shadowRootOptions,
    delegatesFocus: true,
  };

  static styles = [
    tagStyles,
    css`
      :host {
        max-width: 100%;
        /* outline: 0; */
      }

      :focus {
        outline: 1px solid red !important;
      }

      :focus .tag {
        background-color: var(--sl-color-blue-400);
        border-color: var(--sl-color-blue-400);
        color: var(--sl-color-neutral-0);
      }

      .tag {
        height: var(--tag-height, 1.5rem);
        background-color: var(--sl-color-blue-100);
        border-color: var(--sl-color-blue-500);
        color: var(--sl-color-blue-600);
        font-family: var(--sl-font-sans);
      }

      .tag__content {
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tag__remove {
        color: var(--sl-color-blue-600);
        border-radius: 100%;
        transition: background-color 0.1s;
      }

      .tag__remove:hover {
        background-color: var(--sl-color-blue-600);
        color: #fff;
      }
    `,
  ];

  pill = true;

  render() {
    const template = super.render();
    return html`<span tabindex="0">${template}</span>`;
  }
}
