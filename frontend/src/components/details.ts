import { LitElement, html, css, unsafeCSS } from "lit";
import { property } from "lit/decorators.js";
import caretDownFillSvg from "../assets/images/caret-down-fill.svg";
import caretRightFillSvg from "../assets/images/caret-right-fill.svg";

/**
 * Styled <details>
 *
 * Usage example:
 * ```ts
 * <btrix-details>
 *   <span slot="title">Summary</span>
 *   <span slot="summary-description">Summary</span>
 *   ${content}
 * </btrix-details>
 * ```
 *
 * @event on-toggle
 */
export class Details extends LitElement {
  @property({ type: Boolean })
  open? = false;

  @property({ type: Boolean })
  disabled? = false;

  static styles = css`
    :host {
      display: block;
    }

    summary {
      border-bottom: 1px solid var(--sl-panel-border-color);
      color: var(--sl-color-neutral-500);

      margin-bottom: var(--sl-spacing-x-small);
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      list-style: none;
      user-select: none;
    }

    summary:not([aria-disabled="true"])::before {
      display: block;
      width: 1rem;
      height: 1rem;
      margin-right: var(--sl-spacing-2x-small);
      flex: 0;
    }

    details:not([aria-disabled="true"])[open] summary::before {
      content: url(${unsafeCSS(caretDownFillSvg)});
    }

    details:not([aria-disabled="true"]):not([open]) summary::before {
      content: url(${unsafeCSS(caretRightFillSvg)});
    }

    .summary-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 1;
    }

    .title {
      padding: var(--sl-spacing-x-small) 0;
    }
  `;

  connectedCallback() {
    // Preload icon for other state
    const img = new Image();
    if (this.open) {
      img.src = caretRightFillSvg;
    } else {
      img.src = caretDownFillSvg;
    }

    super.connectedCallback();
  }

  render() {
    return html`
      <details
        ?open=${this.open}
        @toggle=${this.onToggle}
        aria-disabled=${this.disabled ? "true" : "false"}
      >
        <summary>
          <div class="summary-content">
            <div class="title">
              <slot name="title"></slot>
            </div>
            <slot name="summary-description"></slot>
          </div>
        </summary>
        <slot></slot>
      </details>
    `;
  }

  private onToggle(e: Event) {
    const isOpen = (e.target as HTMLDetailsElement).open;

    if (isOpen !== this.open) {
      this.dispatchEvent(
        new CustomEvent("on-toggle", {
          detail: { open: isOpen },
        })
      );
    }
  }
}
