import { msg, str } from "@lit/localize";
import { html, nothing } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { iconFor, labelFor, variantFor } from "@/features/qa/review-status";
import { type ArchivedItem } from "@/types/crawler";
import { isCrawl } from "@/utils/crawler";
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";
import appState from "@/utils/state";

export const itemTypeBadge = (itemType: ArchivedItem["type"]) => {
  const upload = itemType === "upload";

  return html`<btrix-badge>
    <sl-icon
      class="mr-1.5"
      name=${upload ? "upload" : "gear-wide-connected"}
      label=${upload ? msg("Upload") : msg("Crawl")}
    ></sl-icon>
    ${upload ? msg("Upload") : msg("Crawl")}</btrix-badge
  >`;
};

const collectionBadge = (collectionCount: number) => {
  const number_of_collections = localize.number(collectionCount);
  const plural_of_collections = pluralOf("collections", collectionCount);

  return html`<btrix-popover
    content=${msg(
      str`Included in ${number_of_collections} ${plural_of_collections}.`,
    )}
    ?disabled=${!collectionCount}
  >
    <btrix-badge variant=${collectionCount ? "cyan" : "neutral"}>
      <sl-icon
        name=${collectionCount ? "check-circle" : "dash-circle"}
        class="mr-1.5"
      ></sl-icon>
      ${collectionCount ? msg("In Collection") : msg("Not in Collection")}
    </btrix-badge>
  </btrix-popover>`;
};

const qaReviewBadge = (reviewStatus: ArchivedItem["reviewStatus"]) => html`
  <sl-tooltip
    content=${ifDefined(reviewStatus ? msg("QA Rating") : undefined)}
    ?disabled=${!reviewStatus}
  >
    <btrix-badge variant=${variantFor(reviewStatus)} ?outline=${!!reviewStatus}>
      <sl-icon
        class="mr-1.5"
        name=${reviewStatus ? iconFor(reviewStatus).name : "clipboard2-data"}
      ></sl-icon>
      ${labelFor(reviewStatus)}</btrix-badge
    >
  </sl-tooltip>
`;

export const badges = (item: ArchivedItem) => {
  return html`<div class="flex flex-wrap gap-3 whitespace-nowrap">
    ${itemTypeBadge(item.type)} ${collectionBadge(item.collectionIds.length)}
    ${isCrawl(item) ? html`${qaReviewBadge(item.reviewStatus)} ` : nothing}
    ${when(
      appState.featureFlags.has("dedupeEnabled"),
      () => html`
        <btrix-dedupe-badge
          .dependencies=${item.requiresCrawls}
          .dependents=${item.requiredByCrawls}
        ></btrix-dedupe-badge>
      `,
    )}
  </div>`;
};

export const badgesSkeleton = () =>
  html`<div class="flex flex-wrap gap-3 whitespace-nowrap">
    <sl-skeleton class="h-4 w-12"></sl-skeleton>
    <sl-skeleton class="h-4 w-12"></sl-skeleton>
  </div>`;
