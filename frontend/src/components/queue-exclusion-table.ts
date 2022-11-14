import { state, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { msg, localized } from "@lit/localize";
import RegexColorize from "regex-colorize";

import type { CrawlConfig } from "../pages/archive/types";
import LiteElement, { html } from "../utils/LiteElement";
import { regexEscape } from "../utils/string";
import type { Exclusion } from "./queue-exclusion-form";

export type ExclusionRemoveEvent = CustomEvent<{
  value: string;
}>;

/**
 * Crawl queue exclusion table
 *
 * Usage example:
 * ```ts
 * <btrix-queue-exclusion-table
 *   .exclusions=${this.crawlTemplate.config.exclude}
 * >
 * </btrix-queue-exclusion-table>
 * ```
 *
 * @event on-remove ExclusionRemoveEvent
 */
@localized()
export class QueueExclusionTable extends LiteElement {
  @property({ type: Array })
  exclusions?: CrawlConfig["exclude"];

  @property({ type: Boolean })
  editable = false;

  @state()
  private results: Exclusion[] = [];

  @state()
  private page: number = 1;

  @state()
  private pageSize: number = 5;

  @state()
  private exclusionToRemove?: string;

  private get total() {
    return this.exclusions?.length;
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("exclusions") && this.exclusions) {
      this.exclusionToRemove = "";

      const prevVal = changedProperties.get("exclusions");
      if (prevVal) {
        const prevTotal = prevVal.length;
        const lastPage = Math.ceil(this.total! / this.pageSize);
        if (this.total! < prevTotal) {
          this.page = Math.min(this.page, lastPage);
        } else if (this.total! > prevTotal) {
          this.page = lastPage;
        }
      }

      this.updatePageResults();
    } else if (changedProperties.has("page")) {
      this.updatePageResults();
    }
  }

  private updatePageResults() {
    if (!this.exclusions) return;

    this.results = this.exclusions
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
              page=${this.page}
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
          <tr class="h-10 text-left">
            <th class="font-normal px-2 w-40 bg-slate-50 ${typeColClass}">
              ${msg("Exclusion Type")}
            </th>
            <th class="font-normal px-2 bg-slate-50 ${valueColClass}">
              ${msg("Exclusion Value")}
            </th>
            <th class="font-normal px-2 w-10 bg-slate-50 ${actionColClass}">
              <span class="sr-only">Row actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
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
      this.getColumnClassNames(index + 1, arr.length);

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
      <tr
        class="h-10 ${this.exclusionToRemove === value
          ? "text-neutral-200"
          : "text-neutral-600"}"
      >
        <td class="py-2 px-3 whitespace-nowrap ${typeColClass}">
          ${typeLabel}
        </td>
        <td class="p-2 font-mono ${valueColClass}">${value}</td>
        <td class="text-[1rem] text-center ${actionColClass}">
          <btrix-icon-button
            name="trash"
            @click=${() => this.removeExclusion(exclusion)}
          ></btrix-icon-button>
        </td>
      </tr>
    `;
  };

  private getColumnClassNames(index: number, count: number) {
    let typeColClass = "border-t border-x";
    let valueColClass = "border-t border-r";
    let actionColClass = "border-t border-r";

    if (index === 0) {
      typeColClass += " rounded-tl";

      if (this.editable) {
        actionColClass += " rounded-tr";
      } else {
        valueColClass += " rounded-tr";
      }
    }

    if (index === count) {
      typeColClass += " border-b rounded-bl";

      if (this.editable) {
        valueColClass += " border-b";
        actionColClass += " border-b rounded-br";
      } else {
        valueColClass += " border-b rounded-br";
      }
    }

    if (!this.editable) {
      actionColClass += " hidden";
    }

    return [typeColClass, valueColClass, actionColClass];
  }

  private removeExclusion(exclusion: Exclusion) {
    this.exclusionToRemove = exclusion.value;

    this.dispatchEvent(
      new CustomEvent("on-remove", {
        detail: exclusion,
      }) as ExclusionRemoveEvent
    );
  }
}
