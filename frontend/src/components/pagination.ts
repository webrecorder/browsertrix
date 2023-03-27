import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";

import chevronLeft from "../assets/icons/chevron-left.svg";
import chevronRight from "../assets/icons/chevron-right.svg";
import { srOnly } from "../utils/css";

/**
 * Pagination
 *
 * Usage example:
 * ```ts
 * <btrix-pagination totalCount="11" @page-change=${this.console.log}>
 * </btrix-pagination>
 * ```
 *
 * @event page-change { page: number; pages: number; }
 */
@localized()
export class Pagination extends LitElement {
  static styles = [
    srOnly,
    css`
      :host {
        --sl-input-height-small: var(--sl-font-size-x-large);
        --sl-input-color: var(--sl-color-neutral-500);
      }

      ul {
        align-items: center;
        list-style: none;
        margin: 0;
        padding: 0;
        color: var(--sl-input-color);
      }

      ul.compact {
        display: flex;
      }

      ul:not(.compact) {
        display: grid;
        grid-gap: var(--sl-spacing-x-small);
        grid-auto-flow: column;
        grid-auto-columns: min-content;
      }

      button {
        all: unset;
        display: flex;
        align-items: center;
        cursor: pointer;
      }

      sl-input::part(input) {
        text-align: center;
        padding: 0 0.5ch;
      }

      .currentPage {
        display: flex;
        align-items: center;
        width: fit-content;
        white-space: nowrap;
      }

      .pageInput {
        position: relative;
        margin-right: 0.5ch;
      }

      /* Use width of text to determine input width */
      .totalPages {
        padding: 0 1ch;
        height: var(--sl-input-height-small);
        min-width: 1ch;
        visibility: hidden;
      }

      .input {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
      }

      .navButton {
        display: grid;
        grid-template-columns: repeat(2, min-content);
        grid-gap: var(--sl-spacing-x-small);
        align-items: center;
        align-items: center;
        font-weight: 600;
        transition: opacity 0.2s;
      }

      .navButton[disabled] {
        opacity: 0.4;
      }

      .navButton:not([disabled]):hover {
        /* opacity: 0.6; */
      }

      .chevron {
        display: block;
        width: var(--sl-spacing-medium);
        height: var(--sl-spacing-medium);
      }
    `,
  ];

  @property({ type: Number })
  page: number = 1;

  @property({ type: Number })
  totalCount: number = 0;

  @property({ type: Number })
  size: number = 10;

  @property({ type: Boolean })
  compact = false;

  @state()
  private inputValue = "";

  @state()
  private pages = 0;

  connectedCallback() {
    this.inputValue = `${this.page}`;
    super.connectedCallback();
  }

  async updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("totalCount") || changedProperties.has("size")) {
      await this.performUpdate;
      this.calculatePages();
    }

    if (changedProperties.get("page") && this.page) {
      await this.performUpdate;
      this.inputValue = `${this.page}`;
      this.onPageChange();
    }
  }

  render() {
    if (!this.pages) {
      return;
    }

    return html`
      <div role="navigation">
        <ul class=${classMap({ compact: this.compact })}>
          <li>
            <button
              class="navButton"
              ?disabled=${this.page === 1}
              @click=${this.onPrev}
            >
              <img class="chevron" src=${chevronLeft} />
              <span class=${classMap({ srOnly: this.compact })}
                >${msg("Previous")}</span
              >
            </button>
          </li>
          ${when(this.compact, this.renderInputPage, this.renderPages)}
          <li>
            <button
              class="navButton"
              ?disabled=${this.page === this.pages}
              @click=${this.onNext}
            >
              <span class=${classMap({ srOnly: this.compact })}
                >${msg("Next")}</span
              >
              <img class="chevron" src=${chevronRight} />
            </button>
          </li>
        </ul>
      </div>
    `;
  }

  private renderInputPage = () => html`
    <li class="currentPage" role="presentation">
      ${msg(html` ${this.renderInput()} of ${this.pages} `)}
    </li>
  `;

  private renderInput() {
    return html`
      <div class="pageInput">
        <div class="totalPages" role="none">${this.pages}</div>
        <sl-input
          class="input"
          inputmode="numeric"
          size="small"
          value=${this.inputValue}
          aria-label=${msg(str`Current page, page ${this.page}`)}
          aria-current="page"
          autocomplete="off"
          min="1"
          max=${this.pages}
          @keydown=${(e: any) => {
            // Prevent typing non-numeric keys
            if (e.key.length === 1 && /\D/.test(e.key)) {
              e.preventDefault();
            }
          }}
          @keyup=${(e: any) => {
            const { key } = e;

            if (key === "ArrowUp" || key === "ArrowRight") {
              this.inputValue = `${Math.min(+this.inputValue + 1, this.pages)}`;
            } else if (key === "ArrowDown" || key === "ArrowLeft") {
              this.inputValue = `${Math.max(+this.inputValue - 1, 1)}`;
            } else {
              this.inputValue = e.target.value;
            }
          }}
          @sl-change=${(e: any) => {
            const page = +e.target.value;

            if (page < 1) {
              this.page = 1;
            } else if (page > this.pages) {
              this.page = this.pages;
            } else {
              this.page = page;
            }

            this.inputValue = `${this.page}`;
          }}
          @focus=${(e: any) => {
            // Select text on focus for easy typing
            e.target.select();
          }}
        ></sl-input>
      </div>
    `;
  }

  private renderPages = () => {
    const pages = Array.from({
      length: Math.ceil(this.totalCount / this.size),
    });
    return html`
      ${pages.map(
        (_, i) =>
          html`<li
            aria-current=${ifDefined(i + 1 === this.page ? "page" : undefined)}
          >
            <btrix-button icon raised>${i + 1}</btrix-button>
          </li>`
      )}
    `;
  };

  private onPrev() {
    this.page = this.page > 1 ? this.page - 1 : 1;
  }

  private onNext() {
    this.page = this.page < this.pages ? this.page + 1 : this.pages;
  }

  private onPageChange() {
    this.dispatchEvent(
      new CustomEvent("page-change", {
        detail: { page: this.page, pages: this.pages },
      })
    );
  }

  private calculatePages() {
    if (this.totalCount && this.size) {
      this.pages = Math.ceil(this.totalCount / this.size);
    } else {
      this.pages = 0;
    }
  }
}
