import { msg } from "@lit/localize";
import { html } from "lit";
import { when } from "lit/directives/when.js";

export function dedupeFilesNotice({
  dependenciesHref,
  collectionHref,
}: { dependenciesHref?: string; collectionHref?: string } = {}) {
  return html`<btrix-alert
    class="sticky top-2 z-10 part-[base]:mb-3"
    variant="warning"
  >
    <div class="mb-2 flex justify-between">
      <span class="inline-flex items-center gap-1.5">
        <sl-icon class="text-base" name="exclamation-diamond-fill"></sl-icon>
        <strong class="font-medium">
          ${msg("This crawl is dependent on other crawls.")}
        </strong>
      </span>
      ${when(
        dependenciesHref,
        (href) =>
          html`<btrix-link
            class="part-[base]:font-medium"
            variant="warning"
            href=${href}
            >${msg("View Dependencies")}</btrix-link
          >`,
      )}
    </div>
    <div class="text-pretty text-warning-800">
      <p>
        ${msg(
          "Files may contain incomplete or missing content due to deduplication.",
        )}
      </p>

      ${when(
        collectionHref,
        (href) => html`
          <p>
            ${msg(
              "Download the collection for complete and deduplicated files.",
            )}
            <btrix-link
              class="part-[base]:font-medium"
              variant="warning"
              href=${href}
              >${msg("Go to Collection")}</btrix-link
            >
          </p>
        `,
      )}
    </div>
  </btrix-alert>`;
}
