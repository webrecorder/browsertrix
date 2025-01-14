import { msg, str } from "@lit/localize";
import { html, type TemplateResult } from "lit";

import { notApplicable } from "@/strings/ui";
import type { Collection } from "@/types/collection";
import localize from "@/utils/localize";

type Metadata = {
  dateEarliest: Collection["dateEarliest"];
  dateLatest: Collection["dateLatest"];
  pageCount: Collection["pageCount"];
  totalSize: Collection["pageCount"];
};

const dateRange = (metadata: Metadata) => {
  if (!metadata.dateEarliest || !metadata.dateLatest) {
    return notApplicable;
  }
  const format: Intl.DateTimeFormatOptions = {
    month: "long",
    year: "numeric",
  };
  const dateEarliest = localize.date(metadata.dateEarliest, format);
  const dateLatest = localize.date(metadata.dateLatest, format);

  if (dateEarliest === dateLatest) return dateLatest;

  return msg(str`${dateEarliest} to ${dateLatest}`, {
    desc: "Date range formatted to show full month name and year",
  });
};

const descList = (metadata?: Metadata) => {
  const skeleton = html`<sl-skeleton class="w-24"></sl-skeleton>`;
  const safeValue = (render: (metadata: Metadata) => unknown) =>
    metadata ? render(metadata) ?? notApplicable : skeleton;

  return html`
    <btrix-desc-list>
      <btrix-desc-list-item label=${msg("Collection Period")}>
        <span class="font-sans">${safeValue(dateRange)}</span>
      </btrix-desc-list-item>
      <btrix-desc-list-item label=${msg("Total Pages")}>
        ${safeValue((metadata) => localize.number(metadata.pageCount))}
      </btrix-desc-list-item>
      <btrix-desc-list-item label=${msg("Collection Size")}>
        ${safeValue((metadata) => localize.bytes(metadata.totalSize))}
      </btrix-desc-list-item>
    </btrix-desc-list>
  `;
};

export function about({
  description,
  metadata,
}: {
  description: TemplateResult;
  metadata?: Metadata;
}) {
  return html`
    <div class="flex flex-1 flex-col gap-10 lg:flex-row">
      <section class="flex w-full max-w-4xl flex-col leading-relaxed">
        ${description}
      </section>
      <section class="flex-1">
        <btrix-section-heading>
          <h2>${msg("Metadata")}</h2>
        </btrix-section-heading>
        <div class="mt-5">${descList(metadata)}</div>
      </section>
    </div>
  `;
}
