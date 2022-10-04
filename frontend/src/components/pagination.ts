import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import chevronLeft from "../assets/images/chevron-left.svg";
import chevronRight from "../assets/images/chevron-right.svg";

/**
 * Pagination
 *
 * Usage example:
 * ```ts
 * <btrix-pagination>
 * </btrix-pagination>
 * ```
 */
@localized()
export class Pagination extends LitElement {
  static styles = css`
    :host {
      --sl-input-height-small: var(--sl-font-size-x-large);
      --sl-input-color: var(--sl-color-neutral-500);
    }

    ul {
      display: flex;
      align-items: center;
      list-style: none;
      margin: 0;
      padding: 0;
      color: var(--sl-input-color);
    }

    button {
      all: unset;
    }

    sl-input {
      min-width: calc(2ch + 2px);
      margin-right: 0.5ch;
    }

    sl-input::part(input) {
      -moz-appearance: textfield;
      margin: 0 0.5ch;
      text-align: center;
    }

    sl-input::part(input)::-webkit-outer-spin-button,
    sl-input::part(input)::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .currentPage {
      display: flex;
      align-items: center;
      width: fit-content;
      white-space: nowrap;
    }

    .chevron {
      padding: 0 var(--sl-font-size-2x-small);
      transition: opacity 0.2s;
    }

    .chevron[disabled] {
      opacity: 0.2;
    }

    .chevron:not([disabled]):hover {
      opacity: 0.6;
    }
  `;

  @property({ type: Number })
  page: number = 1;

  @property({ type: Number })
  totalCount: number = 0;

  @property({ type: Number })
  size: number = 1;

  @state()
  private pages = 0;

  @state()
  private pageValue = "";

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("page")) {
      this.pageValue = `${this.page}`;
    }

    if (changedProperties.has("totalCount") || changedProperties.has("size")) {
      this.calculatePages();
    }
  }

  render() {
    if (!this.pages) {
      return;
    }

    return html`
      <div role="navigation">
        <ul>
          <li>
            <button
              class="chevron"
              aria-label=${msg("Previous page")}
              ?disabled=${this.page === 1}
              @click=${this.onPrev}
            >
              <img src=${chevronLeft} />
            </button>
          </li>
          <li class="currentPage" role="presentation">
            ${msg(html`
              <sl-input
                type="number"
                value=${this.pageValue}
                size="small"
                aria-label=${msg(str`Current page, page ${this.page}`)}
                aria-current="page"
                style="width: calc(${this.pageValue.length + 1}ch + 2px"
                autocomplete="off"
                min="1"
                max=${this.pages}
                @sl-input=${(e: any) => {
                  console.log(e.target.value);
                  this.pageValue = e.target.value;

                  if (!this.pageValue) {
                    this.pageValue = "1";
                  }
                  const page = +this.pageValue;
                  console.log("page", page);

                  if (page < 1) {
                    this.page = 1;
                  } else if (page > this.pages) {
                    this.page = this.pages;
                  } else {
                    this.page = page;
                  }

                  console.log(this.page);

                  // console.log(this.page.toString());
                }}
                @focus=${(e: any) => {
                  // Select text on focus for easy typing
                  e.target.select();
                }}
              ></sl-input>
              of ${this.pages}
            `)}
          </li>
          <li>
            <button
              class="chevron"
              aria-label=${msg("Next page")}
              ?disabled=${this.page === this.pages}
              @click=${this.onNext}
            >
              <img src=${chevronRight} />
            </button>
          </li>
        </ul>
      </div>
    `;
  }

  private onPrev() {
    this.page = this.page > 1 ? this.page - 1 : 1;
  }

  private onNext() {
    this.page = this.page < this.pages ? this.page + 1 : this.pages;
  }

  private calculatePages() {
    if (this.totalCount && this.size) {
      this.pages = Math.ceil(this.totalCount / this.size);
    } else {
      this.pages = 0;
    }
  }
}
