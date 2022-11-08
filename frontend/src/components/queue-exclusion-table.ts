import { state, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { msg, localized } from "@lit/localize";
import RegexColorize from "regex-colorize";

import type { CrawlConfig } from "../pages/archive/types";
import LiteElement, { html } from "../utils/LiteElement";
import { regexEscape } from "../utils/string";
import type { Exclusion } from "./queue-exclusion-form";

/**
 * Crawl queue exclusion table
 *
 * Usage example:
 * ```ts
 * <btrix-queue-exclusion-table
 *   .config=${this.crawlTemplate.config}
 * >
 * </btrix-queue-exclusion-table>
 * ```
 */
@localized()
export class QueueExclusionTable extends LiteElement {
  @property({ type: Array })
  config?: CrawlConfig;

  @state()
  private results: Exclusion[] = [];

  @state()
  private page: number = 1;

  @state()
  private pageSize: number = 5;

  @state()
  private total?: number;

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("config") && this.config?.exclude) {
      this.total = this.config.exclude.length;
      this.updatePageResults();
    } else if (changedProperties.has("page")) {
      this.updatePageResults();
    }
  }

  private updatePageResults() {
    if (!this.config?.exclude) return;

    this.results = this.config.exclude
      .slice((this.page - 1) * this.pageSize, this.page * this.pageSize)
      .map((str: any) => {
        const unescaped = str.replace(/\\/g, "");
        return {
          type: regexEscape(unescaped) === str ? "text" : "regex",
          value: unescaped,
        };
      });
  }

  render() {
    const [typeColClass, valueColClass, actionColClass] =
      this.getColumnClassNames(0, this.results.length);

    return html`<btrix-details open disabled>
      <h4 slot="title">${msg("Exclusion Table")}</h4>
      <div slot="summary-description">
        ${this.total && this.total > this.pageSize
          ? html`<btrix-pagination
              size=${this.pageSize}
              totalCount=${this.total}
              @page-change=${(e: CustomEvent) => {
                this.page = e.detail.page;
              }}
            >
            </btrix-pagination>`
          : ""}
      </div>
      <table
        class="w-full leading-none border-separate"
        style="border-spacing: 0;"
      >
        <thead class="text-xs font-mono text-neutral-600 uppercase">
          <tr class="h-8 text-left">
            <th
              class="font-normal px-2 w-40 bg-slate-50 rounded-tl ${typeColClass}"
            >
              ${msg("Exclusion Type")}
            </th>
            <th class="font-normal px-2 bg-slate-50 ${valueColClass}">
              ${msg("Exclusion Value")}
            </th>
            <th
              class="font-normal px-2 w-9 bg-slate-50 rounded-tr ${actionColClass}"
            >
              <span class="sr-only">Row actions</span>
            </th>
          </tr>
        </thead>
        <tbody class="text-neutral-600">
          ${this.results.map(this.renderItem)}
        </tbody>
      </table>
    </btrix-details> `;
  }

  private renderItem = (
    exclusion: Exclusion,
    index: number,
    arr: Exclusion[]
  ) => {
    const [typeColClass, valueColClass, actionColClass] =
      this.getColumnClassNames(index, arr.length - 1);

    let typeLabel: string = exclusion.type;
    let value: any = exclusion.value;

    switch (exclusion.type) {
      case "regex":
        typeLabel = msg("Regex");
        value = staticHtml`<span class="regex">${unsafeStatic(
          new RegexColorize().colorizeText(exclusion.value)
        )}</span>`;
        break;
      case "text":
        typeLabel = msg("Matches Text");
        break;
      default:
        break;
    }

    return html`
      <tr class="h-8">
        <td class="p-2 whitespace-nowrap ${typeColClass}">${typeLabel}</td>
        <td class="p-2 font-mono ${valueColClass}">${value}</td>
        <td class="text-[1rem] text-center ${actionColClass}">
          <btrix-icon-button name="trash"></btrix-icon-button>
        </td>
      </tr>
    `;
  };

  getColumnClassNames(index: number, count: number) {
    let typeColClass = "border-t border-x";
    let valueColClass = "border-t border-r";
    let actionColClass = "border-t border-r";

    if (index === count) {
      typeColClass += " border-b rounded-bl";
      valueColClass += " border-b";
      actionColClass += " border-b rounded-br";
    }

    return [typeColClass, valueColClass, actionColClass];
  }
}
