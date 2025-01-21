import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";
import { when } from "lit/directives/when.js";

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
    render: (c: PublicCollection) => TemplateResult | string;
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

export function metadataColumn(collection?: Collection | PublicCollection) {
  const metadataItem = metadataItemWithCollection(collection);

  return html`
    <btrix-desc-list>
      ${metadataItem({
        label: msg("Collection Period"),
        render: (col) => html`
          <span class="font-sans">
            ${monthYearDateRange(col.dateEarliest, col.dateLatest)}
          </span>
        `,
      })}
      ${metadataItem({
        label: msg("Pages in Collection"),
        render: (col) =>
          `${localize.number(col.pageCount)} ${pluralOf("pages", col.pageCount)}`,
      })}
      ${metadataItem({
        label: msg("Total Page Snapshots"),
        render: (col) =>
          `${localize.number(col.snapshotCount)} ${pluralOf("snapshots", col.snapshotCount)}`,
      })}
    </btrix-desc-list>
  `;
}
