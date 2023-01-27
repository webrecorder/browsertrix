import { css } from "lit";
import SLDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import dialogStyles from "@shoelace-style/shoelace/dist/components/dialog/dialog.styles.js";

/**
 * Customized <sl-dialog>
 *
 * Usage: see https://shoelace.style/components/dialog
 */
export class Dialog extends SLDialog {
  static styles = css`
    ${dialogStyles} .dialog__panel {
      overflow: hidden;
    }

    .dialog__header {
      background-color: var(--sl-color-neutral-50);
      border-bottom: 1px solid var(--sl-color-neutral-100);
    }

    .dialog__title {
      padding-top: var(--sl-spacing-small);
      padding-bottom: var(--sl-spacing-small);
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-medium);
    }

    .dialog__close {
      --header-spacing: var(--sl-spacing-2x-small);
    }

    .dialog__footer {
      padding-top: var(--sl-spacing-small);
      padding-bottom: var(--sl-spacing-small);
      border-top: 1px solid var(--sl-color-neutral-100);
    }
  `;
}
