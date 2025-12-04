import { msg } from "@lit/localize";
import { html } from "lit";
import { when } from "lit/directives/when.js";

export function dedupeReplayNotice({ href }: { href?: string } = {}) {
  return html`<btrix-alert
    class="sticky top-2 z-50 part-[base]:mb-5"
    variant="warning"
  >
    <div class="mb-2 flex justify-between">
      <span class="inline-flex items-center gap-1.5">
        <sl-icon class="text-base" name="exclamation-diamond-fill"></sl-icon>
        <strong class="font-medium">
          ${msg("This crawl is dependent on other crawls.")}
        </strong>
      </span>
    </div>
    <div class="text-pretty text-warning-800">
      <p>
        ${msg(
          "Replay for this crawl may contain incomplete or missing pages due to its dependency of the deduplication source.",
        )}
      </p>
      ${when(
        href,
        (href) =>
          html` <p class="my-2">
              ${msg(
                "Replay the collection to view the complete and deduplicated crawl.",
              )}
            </p>
            <btrix-link
              class="part-[base]:font-medium"
              variant="warning"
              href=${href}
              >${msg("Go to Collection")}</btrix-link
            >`,
      )}
    </div>
  </btrix-alert>`;
}
