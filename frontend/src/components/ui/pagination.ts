import { localized, msg, str } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";
import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { SearchParamsController } from "@/controllers/searchParams";
import { srOnly } from "@/utils/css";
import localize from "@/utils/localize";
import chevronLeft from "~assets/icons/chevron-left.svg";
import chevronRight from "~assets/icons/chevron-right.svg";

export const parsePage = (value: string | undefined | null) => {
  const page = parseInt(value || "1");
  if (!Number.isFinite(page)) {
    throw new Error("couldn't parse page value from search");
  }
  return page;
};

type PageChangeDetail = {
  page: number;
  pages: number;
};
export type PageChangeEvent = CustomEvent<PageChangeDetail>;

export function calculatePages({
  total,
  pageSize,
}: {
  total: number;
  pageSize: number;
}) {
  if (total && pageSize) {
    return Math.ceil(total / pageSize);
  } else {
    return 0;
  }
}

/**
 * Pagination
 *
 * Persists via a search param in the URL. Defaults to `page`, but can be set with the `name` attribute.
 *
 * Usage example:
 * ```ts
 * <btrix-pagination totalCount="11" @page-change=${console.log}>
 * </btrix-pagination>
 * ```
 *
 * You can have multiple paginations on one page by setting different names:
 * ```ts
 * <btrix-pagination name="page-a" totalCount="11" @page-change=${console.log}>
 * </btrix-pagination>
 * <btrix-pagination name="page-b" totalCount="2" @page-change=${console.log}>
 * </btrix-pagination>
 * ```
 *
 * You can also disable pagination persistence via search params by setting name to `null`:
 * ```ts
 * <btrix-pagination .name=${null} totalCount="11" @page-change=${console.log}>
 * </btrix-pagination>
 * ```
 *
 * @fires page-change {PageChangeEvent}
 */
@customElement("btrix-pagination")
@localized()
export class Pagination extends LitElement {
  static styles = [
    srOnly,
    css`
      ul {
        align-items: center;
        list-style: none;
        margin: 0;
        padding: 0;
        color: var(--sl-color-neutral-500);
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
        /* Match the height of '<btrix-inline-input size="small">' */
        --sl-input-height-small: var(--sl-font-size-x-large);
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
        margin: 0 var(--sl-spacing-x-small);
        align-items: center;
        font-weight: 500;
        transition: opacity 0.2s;
        min-height: 1.5rem;
        min-width: 1.5rem;
        user-select: none;
      }

      .navButton[disabled] {
        opacity: 0.4;
      }

      .navButton:not([disabled]):hover {
        opacity: 0.8;
      }

      .chevron {
        display: block;
        width: var(--sl-spacing-medium);
        height: var(--sl-spacing-medium);
      }

      .compact .navButton {
        display: flex;
        justify-content: center;
      }
    `,
  ];

  searchParams = new SearchParamsController(this, (params) => {
    if (this.name == null) return;
    const page = parsePage(params.get(this.name));
    if (this._page !== page) {
      this.dispatchEvent(
        new CustomEvent<PageChangeDetail>("page-change", {
          detail: { page: page, pages: this.pages },
          composed: true,
        }),
      );
      this._page = page;
    }
  });

  @state()
  private _page = 1;

  @property({ type: Number })
  set page(page: number) {
    if (page !== this._page) {
      this.setPage(page);
      this._page = page;
    }
  }

  get page() {
    return this._page;
  }

  @property({ type: String })
  name: string | null = "page";

  @property({ type: Number })
  totalCount = 0;

  @property({ type: Number })
  size = 10;

  @property({ type: Boolean })
  compact = false;

  @state()
  private inputValue = "";

  @state()
  private pages = 0;

  connectedCallback() {
    this.inputValue = `${this._page}`;
    super.connectedCallback();
  }

  async willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("totalCount") || changedProperties.has("size")) {
      this.calculatePages();
    }

    if (this.name != null) {
      const parsedPage = parseFloat(
        this.searchParams.searchParams.get(this.name) ?? "1",
      );
      if (parsedPage != this._page) {
        const page = parsePage(this.searchParams.searchParams.get(this.name));
        const constrainedPage = Math.max(1, Math.min(this.pages, page));
        this.onPageChange(constrainedPage, { dispatch: false });
      }
    }

    // if page is out of bounds, clamp it & dispatch an event to re-fetch data
    if (
      changedProperties.has("page") &&
      (this.page > this.pages || this.page < 1)
    ) {
      const constrainedPage = Math.max(1, Math.min(this.pages, this.page));
      this.onPageChange(constrainedPage, { dispatch: true });
    }

    if (changedProperties.get("page") && this._page) {
      this.inputValue = `${this._page}`;
    }
  }

  render() {
    if (this.pages < 2) {
      return;
    }

    return html`
      <div role="navigation">
        <ul class=${classMap({ compact: this.compact })}>
          <li>
            <button
              class="navButton"
              ?disabled=${this._page === 1}
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
              ?disabled=${this._page === this.pages}
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

  private readonly renderInputPage = () => html`
    <li class="currentPage" role="presentation">
      ${msg(html` ${this.renderInput()} of ${this.pages} `)}
    </li>
  `;

  private renderInput() {
    return html`
      <div class="pageInput">
        <div class="totalPages" role="none">${this.pages}</div>
        <btrix-inline-input
          class="input"
          inputmode="numeric"
          size="small"
          value=${this.inputValue}
          aria-label=${msg(str`Current page, page ${this._page}`)}
          aria-current="page"
          autocomplete="off"
          min="1"
          max=${this.pages}
          @keydown=${(e: KeyboardEvent) => {
            // Prevent typing non-numeric keys
            if (e.key.length === 1 && /\D/.test(e.key)) {
              e.preventDefault();
            }
          }}
          @keyup=${(e: KeyboardEvent) => {
            const { key } = e;

            if (key === "ArrowUp" || key === "ArrowRight") {
              this.inputValue = `${Math.min(+this.inputValue + 1, this.pages)}`;
            } else if (key === "ArrowDown" || key === "ArrowLeft") {
              this.inputValue = `${Math.max(+this.inputValue - 1, 1)}`;
            } else {
              this.inputValue = (e.target as SlInput).value;
            }
          }}
          @sl-change=${(e: Event) => {
            const page = +(e.target as HTMLInputElement).value;
            let nextPage = page;

            if (page < 1) {
              nextPage = 1;
            } else if (page > this.pages) {
              nextPage = this.pages;
            } else {
              nextPage = page;
            }

            this.onPageChange(nextPage);
          }}
          @focus=${(e: Event) => {
            // Select text on focus for easy typing
            (e.target as SlInput).select();
          }}
        ></btrix-inline-input>
      </div>
    `;
  }

  private readonly renderPages = () => {
    const pages = Array.from({ length: this.pages }).map((_, i) => i + 1);
    const middleVisible = 3;
    const middlePad = Math.floor(middleVisible / 2);
    const middleEnd = middleVisible * 2 - 1;
    const endsVisible = 2;
    if (this.pages > middleVisible + middleEnd) {
      const currentPageIdx = pages.indexOf(this._page);
      const firstPages = pages.slice(0, endsVisible);
      const lastPages = pages.slice(-1 * endsVisible);
      let middlePages = pages.slice(endsVisible, middleEnd);
      if (currentPageIdx > middleVisible) {
        middlePages = pages.slice(
          Math.min(currentPageIdx - middlePad, this.pages - middleEnd),
          Math.min(currentPageIdx + middlePad + 1, this.pages - endsVisible),
        );
      }

      return html`
        ${firstPages.map(this.renderPageButton)}
        ${when(
          middlePages[0] > firstPages[firstPages.length - 1] + 1,
          () => html`...`,
        )}
        ${middlePages.map(this.renderPageButton)}
        ${when(
          lastPages[0] > middlePages[middlePages.length - 1] + 1,
          () => html`...`,
        )}
        ${lastPages.map(this.renderPageButton)}
      `;
    }
    return html`${pages.map(this.renderPageButton)}`;
  };

  private readonly renderPageButton = (page: number) => {
    const isCurrent = page === this._page;
    return html`<li aria-current=${ifDefined(isCurrent ? "page" : undefined)}>
      <btrix-navigation-button
        .active=${isCurrent}
        .size=${"x-small"}
        .align=${"center"}
        @click=${() => this.onPageChange(page)}
        aria-disabled=${isCurrent}
        >${localize.number(page)}</btrix-navigation-button
      >
    </li>`;
  };

  private onPrev() {
    this.onPageChange(this._page > 1 ? this._page - 1 : 1);
  }

  private onNext() {
    this.onPageChange(this._page < this.pages ? this._page + 1 : this.pages);
  }

  private onPageChange(page: number, opts = { dispatch: true }) {
    if (this._page !== page) {
      this.setPage(page);

      if (opts.dispatch) {
        this.dispatchEvent(
          new CustomEvent<PageChangeDetail>("page-change", {
            detail: { page: page, pages: this.pages },
            composed: true,
          }),
        );
      }
    }
    this._page = page;
  }

  private setPage(page: number) {
    if (this.name != null) {
      if (page === 1) {
        this.searchParams.delete(this.name);
      } else {
        this.searchParams.set(this.name, page.toString());
      }
    } else {
      this._page = page;
    }
  }

  private calculatePages() {
    this.pages = calculatePages({
      total: this.totalCount,
      pageSize: this.size,
    });
  }
}
