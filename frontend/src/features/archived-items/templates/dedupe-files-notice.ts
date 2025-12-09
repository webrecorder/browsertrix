import { msg } from "@lit/localize";
import { html, nothing } from "lit";
import { when } from "lit/directives/when.js";

export function dedupeFilesNotice({ href }: { href?: string } = {}) {
  return html`<btrix-alert
    class="sticky top-2 z-50 part-[base]:mb-3"
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
        href,
        (href) =>
          html`<btrix-link
            class="part-[base]:font-medium"
            variant="warning"
            href=${href}
            >${msg("Go to Collection")}</btrix-link
          >`,
      )}
    </div>
    <div class="text-pretty text-warning-800">
      <p>
        ${msg(
          "Files may contain incomplete or missing content due to deduplication.",
        )}
      </p>
      ${href
        ? html`
            <p>
              ${msg(
                "Go to the collection to download the complete and deduplicated items.",
              )}
            </p>
          `
        : nothing}
    </div>
  </btrix-alert>`;
}
