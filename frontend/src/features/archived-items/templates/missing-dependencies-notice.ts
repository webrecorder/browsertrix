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
  truncate,
}: {
  ids: string[];
  dependenciesHref?: string;
  topCss?: string;
  truncate?: boolean;
}) {
  const dependencies_count = localize.number(ids.length);
  const plural_of_dependencies = pluralOf("dependencies", ids.length);
  const title = html`<span class="inline-flex items-center gap-1.5">
    <sl-icon name="exclamation-diamond-fill"></sl-icon>
    <strong class="font-medium capitalize">
      ${msg(str`Missing ${dependencies_count} ${plural_of_dependencies}`)}
    </strong>
  </span>`;
  const description = msg(
    "Some archived items required by this crawl have been deleted and are no longer available.",
  );

  if (truncate) {
    return html`<btrix-popover placement="left">
      <sl-icon
        class="text-base text-warning-700"
        name="exclamation-diamond-fill"
        label=${msg("Warning")}
      ></sl-icon>

      <div slot="content" class=${tw`[&_sl-icon]:text-neutral-600`}>
        ${title}
        <sl-divider class="mb-2 mt-1.5"></sl-divider>
        ${description}
      </div>
    </btrix-popover>`;
  }

  return html`<btrix-alert
    class=${clsx(tw`sticky z-50 part-[base]:mb-3`, topCss || tw`top-2`)}
    variant="warning"
  >
    <div class="${tw`[&_sl-icon]:text-base`} mb-2 flex justify-between">
      ${title}
      ${when(
        dependenciesHref,
        (href) =>
          html`<btrix-link
            class="part-[base]:font-medium"
            variant="warning"
            href=${href}
            >${msg("Review Dependencies")}</btrix-link
          >`,
      )}
    </div>
    <div class="text-pretty text-warning-800">
      <p class="mb-1.5">${description}</p>
      <p>
        ${msg(
          "Replay and WACZ files may contain incomplete or missing content.",
        )}
      </p>
    </div>
  </btrix-alert>`;
}
