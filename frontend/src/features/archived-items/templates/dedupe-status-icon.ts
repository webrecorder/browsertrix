import { msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";

import {
  dedupeIconFor,
  dedupeLabelFor,
} from "@/features/collections/dedupe-badge";
import type { ArchivedItem } from "@/types/crawler";
import { isCrawl } from "@/utils/crawler";
import { tw } from "@/utils/tailwind";

export function dedupeStatusIcon(item: ArchivedItem) {
  const hasDependents = isCrawl(item) && item.requiredByCrawls.length;
  const hasDependencies = isCrawl(item) && item.requiresCrawls.length;
  const dedupeEnabled = hasDependents || hasDependencies;

  let tooltip = msg("No Dependencies");
  let icon = "layers";

  if (hasDependents && hasDependencies) {
    tooltip = dedupeLabelFor.both;
    icon = dedupeIconFor.both;
  } else if (hasDependencies) {
    tooltip = dedupeLabelFor.dependent;
    icon = dedupeIconFor.dependent;
  } else if (hasDependents) {
    tooltip = dedupeLabelFor.dependency;
    icon = dedupeIconFor.dependency;
  }

  return html`
    <sl-tooltip content=${tooltip} hoist>
      <sl-icon
        class=${clsx(
          tw`size-4 text-base`,
          dedupeEnabled ? tw`text-orange-400` : tw`text-neutral-300`,
        )}
        name=${icon}
      ></sl-icon>
    </sl-tooltip>
  `;
}
