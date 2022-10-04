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
 * <btrix-pagination page='2' totalCount='10'>
 * </btrix-pagination>
 * ```
 *
 * @event page-change
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

    sl-dropdown {
      margin-right: 0.5ch;
    }

    sl-dropdown sl-button {
      min-width: 3ch;
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
  totalCount: number = 0;

  @property({ type: Number })
  size: number = 10;

  @state()
  private page: number = 1;

  @state()
  private pages = 0;

  async updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("totalCount") || changedProperties.has("size")) {
      await this.performUpdate;
      this.calculatePages();
    }

    if (changedProperties.get("page") && this.page) {
      this.onPageChange();
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
              <sl-dropdown placement="bottom" @sl-select=${this.onSelectPage}>
                <sl-button
                  slot="trigger"
                  size="small"
                  style="width: calc(${`${this.page}`.length + 1.5}ch"
                  >${this.page}</sl-button
                >
                <sl-menu>
                  ${Array.from({ length: this.pages }).map((x, idx) => {
                    const page: number = idx + 1;
                    return html`
                      <sl-menu-item value=${page} ?checked=${page === this.page}
                        >${page}</sl-menu-item
                      >
                    `;
                  })}
                </sl-menu>
              </sl-dropdown>
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

  private onSelectPage(e: CustomEvent) {
    this.page = +e.detail.item.value;
  }

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
