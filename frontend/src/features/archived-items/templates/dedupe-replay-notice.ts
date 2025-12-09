import { msg } from "@lit/localize";
import { html } from "lit";
import { when } from "lit/directives/when.js";

import { tw } from "@/utils/tailwind";

export function dedupeReplayNotice({
  dependenciesHref,
  collectionHref,
  topClass,
}: {
  dependenciesHref?: string;
  collectionHref?: string;
  topClass?: string;
} = {}) {
  return html`<btrix-alert
    class="${topClass || tw`top-2`} sticky z-10 part-[base]:mb-3"
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
          "Replay for this crawl may contain incomplete or missing pages due to its dependency of the deduplication source.",
        )}
      </p>
      ${when(
        collectionHref,
        (href) => html`
          <p>
            ${msg(
              "View the collection to replay the complete and deduplicated crawl.",
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
