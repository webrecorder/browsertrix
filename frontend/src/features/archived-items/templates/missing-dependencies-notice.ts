import { msg, str } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { when } from "lit/directives/when.js";

import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

export function missingDependenciesNotice({
  ids,
  dependenciesHref,
  topCss,
  bottomCss,
  truncate,
  dismiss,
}: {
  ids: string[];
  dependenciesHref?: string;
  topCss?: string;
  bottomCss?: string;
  truncate?: boolean;
  dismiss?: () => void;
}) {
  const dependencies_count = localize.number(ids.length);
  const plural_of_dependencies = pluralOf("dependencies", ids.length);
  const description = msg(
    "Some archived content may be missing or incomplete.",
  );

  if (truncate) {
    return html`<btrix-popover
      content="${msg(
        str`Missing ${dependencies_count} ${plural_of_dependencies}`,
      )}. ${description}"
      placement="left"
    >
      <sl-icon
        class="text-base text-warning-700"
        name="exclamation-diamond-fill"
        label=${msg("Warning")}
      ></sl-icon>
    </btrix-popover>`;
  }

  return html`<btrix-alert
    class=${clsx(
      tw`sticky z-50 mx-auto`,
      topCss ?? tw`top-2`,
      bottomCss ?? tw`part-[base]:mb-3`,
    )}
    variant="warning"
  >
    <div class="mb-2 flex justify-between">
      <span class="inline-flex items-center gap-1.5">
        <sl-icon class="text-base" name="exclamation-diamond-fill"></sl-icon>
        <strong class="font-medium capitalize">
          ${msg(str`Missing ${dependencies_count} ${plural_of_dependencies}`)}
        </strong>
      </span>

      ${dismiss
        ? html`<sl-button
            class="part-[base]:min-h-5 part-[base]:leading-5 part-[base]:!text-warning-700 part-[base]:hover:!text-warning-800"
            size="small"
            variant="text"
            @click=${dismiss}
          >
            <sl-icon slot="prefix" name="check-lg"></sl-icon>
            ${msg("Dismiss")}
          </sl-button>`
        : html`${when(
            dependenciesHref,
            (href) =>
              html`<btrix-link
                class="part-[base]:font-medium"
                variant="warning"
                href=${href}
                >${msg("Review Dependencies")}</btrix-link
              >`,
          )}`}
    </div>
    <div class="text-pretty text-warning-800">
      <p class="max-w-prose">
        ${msg(
          "Archived items required by this crawl have been deleted and are no longer available.",
        )}
        ${description}
      </p>
    </div>
  </btrix-alert>`;
}
