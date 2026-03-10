import clsx from "clsx";
import { html } from "lit";

import {
  dedupeIcon,
  dedupeLabelFor,
} from "@/features/collections/templates/dedupe-icon";
import type { ArchivedItem } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

export function dedupeStatusIcon(item: ArchivedItem) {
  const hasDependents = Boolean(item.requiredByCrawls.length);
  const hasDependencies = Boolean(item.requiresCrawls.length);
  const dedupeEnabled = hasDependents || hasDependencies;

  let tooltip = dedupeLabelFor.none;

  if (hasDependents && hasDependencies) {
    tooltip = dedupeLabelFor.both;
  } else if (hasDependencies) {
    tooltip = dedupeLabelFor.dependent;
  } else if (hasDependents) {
    tooltip = dedupeLabelFor.dependency;
  }

  return html`
    <sl-tooltip content=${tooltip} hoist>
      ${dedupeIcon(
        {
          hasDependents,
          hasDependencies,
        },
        {
          className: clsx(
            tw`size-4 text-base`,
            dedupeEnabled ? tw`text-orange-400` : tw`text-neutral-300`,
          ),
        },
      )}
    </sl-tooltip>
  `;
}
