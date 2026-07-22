import { css, html, LitElement, unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";

import caretDownFillSvg from "~assets/images/caret-down-fill.svg";
import caretRightFillSvg from "~assets/images/caret-right-fill.svg";

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
 * @cssPart base
 * @cssPart base--closed
 * @cssPart base--open
 * @cssPart summary
 * @cssPart summary-content
 * @cssPart summary-title
 * @fires on-toggle { open: boolean; }
 */
@customElement("btrix-details")
export class Details extends LitElement {
  @property({ type: Boolean, reflect: true })
  open? = false;

  @property({ type: Boolean })
  disabled? = false;

  // postcss-lit-disable-next-line
  static styles = css`
    :host {
      --margin-bottom: var(--sl-spacing-2x-small);
      --border-bottom: 1px solid var(--sl-panel-border-color);
      display: block;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary {
      color: var(--sl-color-neutral-500);
      margin-bottom: 0;
      line-height: 1;
      display: flex;
      align-items: center;
      list-style: none;
    }

    details[aria-disabled="false"] summary {
      border-bottom: var(--border-bottom);
      cursor: pointer;
      user-select: none;
    }

    details[open] summary {
      margin-bottom: var(--margin-bottom);
    }

    details[aria-disabled="false"] summary::before {
      display: block;
      width: 1rem;
      height: 1rem;
      margin-right: 0.25rem;
      margin-left: -0.25rem;
      flex: 0;
    }

    details[aria-disabled="false"][open] summary::before {
      content: url(${unsafeCSS(caretDownFillSvg)});
    }

    details[aria-disabled="false"]:not([open]) summary::before {
      content: url(${unsafeCSS(caretRightFillSvg)});
    }

    .summary-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 1;
    }

    .title {
      line-height: 1.125rem;
      height: 1.125rem;
      padding: 0.375rem 0;
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

  public show() {
    this.open = true;
  }

  render() {
    return html`
      <details
        ?open=${this.open}
        @click=${this.onClick}
        @toggle=${this.onToggle}
        aria-disabled=${this.disabled ? "true" : "false"}
        part="base ${this.open ? "base--open" : "base--closed"}"
      >
        <summary tabindex=${this.disabled ? "-1" : "0"} part="summary">
          <div class="summary-content" part="summary-content">
            <div class="title" part="summary-title">
              <slot name="title"></slot>
            </div>
            <slot name="summary-description"></slot>
          </div>
        </summary>
        <slot></slot>
      </details>
    `;
  }

  private onClick(e: Event) {
    if (this.disabled) {
      e.preventDefault();
      return;
    }
  }

  private onToggle(e: Event) {
    const isOpen = (e.target as HTMLDetailsElement).open;

    if (isOpen !== this.open) {
      this.open = isOpen;
      this.dispatchEvent(
        new CustomEvent("on-toggle", {
          detail: { open: isOpen },
        }),
      );
    }
  }
}
