import { msg } from "@lit/localize";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { APP_ICON_LIBRARY } from "@/shoelace";

type DedupeIcon = { name: string; library?: string };

export const dedupeIconFor = {
  dependent: {
    name: "layers-half2",
    library: APP_ICON_LIBRARY,
  },
  dependency: {
    name: "layers-half",
  },
  both: {
    name: "layers-fill",
  },
  none: {
    name: "layers",
  },
} satisfies Record<string, DedupeIcon>;

export const dedupeLabelFor = {
  dependent: msg("Dependent"),
  dependency: msg("Dependency"),
  both: msg("Dependent/Dependency"),
  none: msg("No Dependencies"),
} as const;

export function dedupeIcon(
  {
    hasDependents,
    hasDependencies,
  }: {
    hasDependents?: boolean;
    hasDependencies?: boolean;
  } = {},
  { className }: { className?: string } = {},
) {
  let label: string = dedupeLabelFor.none;
  let icon: DedupeIcon = dedupeIconFor.none;

  if (hasDependents && hasDependencies) {
    label = dedupeLabelFor.both;
    icon = dedupeIconFor.both;
  } else if (hasDependencies) {
    label = dedupeLabelFor.dependent;
    icon = dedupeIconFor.dependent;
  } else if (hasDependents) {
    label = dedupeLabelFor.dependency;
    icon = dedupeIconFor.dependency;
  }

  return html`<sl-icon
    class=${ifDefined(className)}
    name=${icon.name}
    library=${ifDefined(icon.library)}
    label=${label}
  ></sl-icon>`;
}
