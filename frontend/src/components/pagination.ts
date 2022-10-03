import { LitElement, html, css, unsafeCSS } from "lit";
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

    sl-input {
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

    .chevron:hover {
      opacity: 0.5;
    }
  `;

  @state()
  private currentPage = 1;

  totalPages = 10;

  render() {
    return html`
      <nav>
        <ul>
          <li>
            <a
              class="chevron"
              href="#"
              aria-label=${msg("Previous page")}
              @click=${(e: any) => e.preventDefault()}
            >
              <img src=${chevronLeft} />
            </a>
          </li>
          <li class="currentPage" role="presentation">
            ${msg(html`
              <sl-input
                type="number"
                value=${this.currentPage}
                size="small"
                aria-label=${msg(str`Current page, page ${this.currentPage}`)}
                aria-current="page"
                style="width: calc(${this.currentPage.toString().length +
                1}ch + 2px"
                autocomplete="off"
                @sl-input=${(e: any) => {
                  this.currentPage = e.target.value;
                }}
                @focus=${(e: any) => {
                  // Select text on focus for easy typing
                  e.target.select();
                }}
              ></sl-input>
              of ${this.totalPages}
            `)}
          </li>
          <li>
            <a
              class="chevron"
              href="#"
              aria-label=${msg("Next page")}
              @click=${(e: any) => e.preventDefault()}
            >
              <img src=${chevronRight} />
            </a>
          </li>
        </ul>
      </nav>
    `;
  }
}
