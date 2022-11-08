import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

/**
 * Button with single icon.
 * Icons names from https://shoelace.style/components/icon
 *
 * Usage example:
 * ```ts
 * <btrix-icon-button name="plus-lg"></btrix-icon-button>
 * ```
 */
export class IconButton extends LitElement {
  @property({ type: String })
  name: string = "square";

  @property({ type: String })
  type: "submit" | "button" = "button";

  @property({ type: String })
  variant: "primary" | "danger" | "neutral" = "neutral";

  static styles = css`
    button {
      all: unset;
      width: 1.5rem;
      height: 1.5rem;
      padding: 0.25rem;
      border-radius: var(--sl-border-radius-small);
      box-sizing: border-box;
      text-align: center;
      cursor: pointer;
      transform: translateY(0px);
      transition: background-color 0.15s, box-shadow 0.15s, color 0.15s,
        transform 0.15s;
    }

    sl-icon {
      display: block;
      font-size: 1rem;
    }

    .primary,
    .danger {
      box-shadow: var(--sl-shadow-x-small);
    }

    .primary:hover,
    .danger:hover {
      box-shadow: 0px 0px 1px rgba(0, 0, 0, 0.1);
      transform: translateY(1px);
    }

    .primary {
      background-color: var(--sl-color-primary-50);
      color: var(--sl-color-primary-600);
    }

    .primary:hover {
      background-color: var(--sl-color-primary-100);
    }

    .danger {
      background-color: var(--sl-color-danger-50);
      color: var(--sl-color-danger-600);
    }

    .danger:hover {
      background-color: var(--sl-color-danger-100);
    }

    .neutral {
      background-color: var(--sl-color-neutral-0);
      color: var(--sl-color-neutral-500);
    }

    .neutral:hover {
      background-color: var(--sl-color-neutral-50);
      color: var(--sl-color-neutral-700);
    }
  `;

  render() {
    return html`<button type=${this.type} class=${this.variant}>
      <sl-icon name=${this.name}></sl-icon>
    </button>`;
  }
}
