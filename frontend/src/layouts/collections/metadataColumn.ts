import { html, nothing, type TemplateResult } from "lit";
import { when } from "lit/directives/when.js";

import { metadata } from "@/strings/collections/metadata";
import { monthYearDateRange } from "@/strings/utils";
import type { Collection, PublicCollection } from "@/types/collection";
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";

export function metadataItemWithCollection(
  collection?: Collection | PublicCollection,
) {
  return function metadataItem({
    label,
    render,
  }: {
    label: string | TemplateResult;
    render: (c: Collection | PublicCollection) => TemplateResult | string;
  }) {
    return html`
      <btrix-desc-list-item label=${label}>
        ${when(
          collection,
          render,
          () => html`<sl-skeleton class="w-full"></sl-skeleton>`,
        )}
      </btrix-desc-list-item>
    `;
  };
}

export function metadataColumn(
  collection?: Collection | PublicCollection,
  { publicView } = { publicView: false },
) {
  const metadataItem = metadataItemWithCollection(collection);

  return html`
    <btrix-desc-list>
      ${metadataItem({
        label: metadata.dateLatest,
        render: (col) => html`
          <span class="font-sans">
            ${monthYearDateRange(col.dateEarliest, col.dateLatest)}
          </span>
        `,
      })}
      ${metadataItem({
        label: metadata.uniquePageCount,
        render: (col) =>
          `${localize.number(col.uniquePageCount)} ${pluralOf("pages", col.uniquePageCount)}`,
      })}
      ${metadataItem({
        label: metadata.pageCount,
        render: (col) =>
          `${localize.number(col.pageCount)} ${pluralOf("pages", col.pageCount)}`,
      })}
      ${publicView
        ? metadataItem({
            label: metadata.totalSize,
            render: (col) => `${localize.bytes(col.totalSize)}`,
          })
        : nothing}
      ${metadataItem({
        label: metadata.topPageHosts,
        render: (col) =>
          html` <table>
            ${col.topPageHosts.map(
              (x) => html`
                <tr>
                  <td>${x.host}</td>
                  <td class="pl-4">
                    ${localize.number(x.count, { notation: "compact" })}
                  </td>
                </tr>
              `,
            )}
          </table>`,
      })}
    </btrix-desc-list>
  `;
}
