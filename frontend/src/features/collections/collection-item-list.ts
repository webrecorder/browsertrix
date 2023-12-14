import { type TemplateResult, LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { type ArchivedItem } from "@/types/crawler";

/**
 * @example Usage:
 * ```ts
 * ```
 */
@localized()
@customElement("btrix-collection-item-list")
export class CollectionItemList extends LitElement {
  static styles = css`
    :host {
      --border: var(--sl-panel-border-width) solid var(--sl-panel-border-color);
    }

    btrix-table-header-cell {
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-x-small);
      line-height: 1;
    }

    btrix-table-header-cell::part(base) {
      padding-bottom: var(--sl-spacing-x-small);
    }

    btrix-table-cell::part(base) {
      height: 2.5rem;
    }

    btrix-table::part(body) {
      border: var(--border);
      border-radius: var(--sl-border-radius-medium);
      color: var(--sl-color-neutral-900);
    }

    .itemRow {
      cursor: pointer;
    }

    .itemRow::part(base) {
      transition-property: background-color, box-shadow;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      transition-duration: 150ms;
    }

    .itemRow:nth-of-type(n + 2)::part(base) {
      border-top: var(--border);
    }

    .itemRow:hover::part(base),
    .itemRow:focus-within::part(base) {
      background-color: var(--sl-color-neutral-50);
    }

    btrix-table-cell::part(base) {
      display: flex;
      align-items: center;
    }

    .checkbox::part(base) {
      padding: var(--sl-spacing-small);
    }

    .checkbox sl-checkbox {
      display: flex;
    }
  `;

  @property({ type: Array })
  items: ArchivedItem[] = [];

  render() {
    return html`
      <btrix-table>
        <btrix-table-header-cell slot="head"></btrix-table-header-cell>
        <btrix-table-header-cell slot="head"
          >${msg("Name")}</btrix-table-header-cell
        >
        <btrix-table-header-cell slot="head"
          >${msg("Date Finished")}</btrix-table-header-cell
        >
        <btrix-table-header-cell slot="head"
          >${msg("Size")}</btrix-table-header-cell
        >
        <btrix-table-header-cell slot="head"
          >${msg("Created By")}</btrix-table-header-cell
        >
        ${this.items.map(
          (item) => html`
            <btrix-table-row class="itemRow" tabindex="0">
              <btrix-table-cell class="checkbox"
                ><sl-checkbox></sl-checkbox
              ></btrix-table-cell>
              <btrix-table-cell class="name">
                <btrix-crawl-status
                  state=${item.state}
                  hideLabel
                  ?isUpload=${item.type === "upload"}
                ></btrix-crawl-status>
                ${this.renderName(item)}</btrix-table-cell
              >
              <btrix-table-cell> TODO </btrix-table-cell>
              <btrix-table-cell> TODO </btrix-table-cell>
              <btrix-table-cell> TODO </btrix-table-cell>
            </btrix-table-row>
          `
        )}
      </btrix-table>
    `;
  }

  private renderName(item: ArchivedItem) {
    if (item.name) return html`<span class="truncate">${item.name}</span>`;
    if (item.type == "upload")
      return html`<span class="truncate">${msg("(unnamed upload)")}</span>`;
    if (!item.firstSeed) return html`<span class="truncate">${item.id}</span>`;
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="additionalUrls"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="additionalUrls"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <span class="primaryUrl truncate">${item.firstSeed}</span>${nameSuffix}
    `;
  }
}
