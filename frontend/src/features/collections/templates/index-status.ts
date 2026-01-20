import { msg } from "@lit/localize";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { labelWithIcon } from "@/layouts/labelWithIcon";
import { stringFor } from "@/strings/ui";
import type { DedupeIndexState } from "@/types/dedupe";
import { APP_ICON_LIBRARY } from "@/types/shoelace";
import { indexAvailable, indexInUse, indexUpdating } from "@/utils/dedupe";
import { tw } from "@/utils/tailwind";

export function indexStatus(state?: DedupeIndexState | null) {
  let label = stringFor.unknown;
  let iconName = "question-diamond";
  let iconClass = tw`text-neutral-400`;

  if (state) {
    if (indexAvailable(state)) {
      label = msg("Available");
      iconName = "check-circle-fill";
      iconClass = tw`text-success-600`;
    } else if (indexInUse(state)) {
      label = msg("In Use");
      iconName = "dot";
      iconClass = tw`animate-pulse text-success-600`;
    } else if (indexUpdating(state)) {
      label =
        state === "purging" ? msg("Purging Index") : msg("Updating Index");
      iconName = "dot";
      iconClass = tw`animate-pulse text-violet-600`;
    } else if (state === "initing") {
      label = msg("Creating Index");
      iconName = "hourglass-split";
      iconClass = tw`text-violet-600`;
    }
  }

  const icon = html`<sl-icon
    class=${iconClass}
    name=${iconName}
    library=${ifDefined(iconName === "dot" ? APP_ICON_LIBRARY : undefined)}
  ></sl-icon>`;

  return labelWithIcon({
    label,
    icon,
  });
}
