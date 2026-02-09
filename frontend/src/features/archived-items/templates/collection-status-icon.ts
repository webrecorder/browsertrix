import { msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";

import type { ArchivedItem } from "@/types/crawler";
import type { IconLibrary } from "@/types/shoelace";
import { isActive, isCrawl } from "@/utils/crawler";
import { tw } from "@/utils/tailwind";

export function collectionStatusIcon({
  item,
  collectionId,
}: {
  item: ArchivedItem;
  collectionId?: string;
}) {
  const inCollection =
    collectionId && item.collectionIds.includes(collectionId);
  let icon = "dash-circle";
  let library: IconLibrary = "default";
  let variant = tw`text-neutral-400`;
  let tooltip = msg("Not in Collection");

  if (inCollection) {
    icon = "check-circle";
    variant = tw`text-cyan-500`;

    if (collectionId) {
      tooltip = msg("In Same Collection");
    } else {
      tooltip = msg("In Collection");
    }
  } else if (isCrawl(item) && isActive(item)) {
    icon = "dot";
    library = "app";
    variant = tw`animate-pulse text-success`;
    tooltip = msg("Active Run");
  }

  return html`<sl-tooltip content=${tooltip} hoist placement="left">
    <sl-icon
      name=${icon}
      class=${clsx(variant, tw`text-base`)}
      library=${library}
    ></sl-icon>
  </sl-tooltip>`;
}
