import { msg } from "@lit/localize";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { labelWithIcon } from "@/layouts/labelWithIcon";
import { APP_ICON_LIBRARY } from "@/shoelace";
import { stringFor } from "@/strings/ui";
import type { DedupeIndexState } from "@/types/dedupe";
import { tw } from "@/utils/tailwind";

export function indexStatus(state: DedupeIndexState) {
  let label = stringFor.unknown;
  let iconName = "question-diamond";
  let iconClass = tw`text-neutral-400`;

  switch (state) {
    case "initing":
      label = msg("Initializing");
      iconName = "hourglass-split";
      iconClass = tw`text-violet-600`;
      break;
    case "importing":
      label = msg("Importing");
      iconName = "hourglass-split";
      iconClass = tw`text-violet-600`;
      break;
    case "ready":
      label = msg("Ready");
      iconName = "hourglass-split";
      iconClass = tw`text-violet-600`;
      break;
    case "purging":
      label = msg("Purging");
      iconName = "hourglass-split";
      iconClass = tw`text-violet-600`;
      break;
    case "idle":
      label = msg("Idle");
      iconName = "hourglass-split";
      iconClass = tw`text-violet-600`;
      break;
    case "saving":
      label = msg("Saving");
      iconName = "hourglass-split";
      iconClass = tw`text-violet-600`;
      break;
    case "crawling":
      label = msg("Crawling");
      iconName = "hourglass-split";
      iconClass = tw`text-violet-600`;
      break;
    default:
      break;
  }

  const icon = html`<sl-icon
    class=${iconClass}
    name=${iconName}
    library=${ifDefined(iconName === "dot" ? APP_ICON_LIBRARY : undefined)}
  ></sl-icon>`;

  return labelWithIcon({ label, icon });
}
