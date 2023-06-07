import { css, html } from "lit";
import { state, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
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
      }

      :focus {
        outline: 0;
      }

      :focus .tag {
        background-color: var(--sl-color-blue-500);
        border-color: var(--sl-color-blue-500);
      }

      :focus .tag,
      :focus .tag__remove {
        color: var(--sl-color-neutral-0);
      }

      .tag,
      .tag__remove {
        transition: background-color 0.1s, color 0.1s;
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
      }

      .tag__remove:hover {
        background-color: var(--sl-color-blue-600);
        color: var(--sl-color-neutral-0);
      }

      .tag--small {
        font-size: var(--sl-font-size-x-small);
      }
    `,
  ];

  @property({ type: String, noAccessor: true })
  tabindex?: string;

  pill = true;

  render() {
    const template = super.render();
    return html`<span tabindex=${ifDefined(this.tabindex)}>${template}</span>`;
  }
}
