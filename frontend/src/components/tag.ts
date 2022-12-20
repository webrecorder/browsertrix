import { css } from "lit";
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
  static styles = css`
    ${tagStyles}

    .tag {
      height: var(--tag-height, 1.5rem);
      background-color: var(--sl-color-blue-100);
      border-color: var(--sl-color-blue-500);
      color: var(--sl-color-blue-600);
      font-family: var(--font-monostyle-family);
      font-variation-settings: var(--font-monostyle-variation);
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
  `;

  pill = true;
}
