import { msg } from "@lit/localize";
import { html, nothing } from "lit";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";

import type { Profile } from "@/types/crawler";

export const usageBadge = (inUse: boolean) =>
  html`<btrix-badge
    variant=${inUse ? "cyan" : "neutral"}
    class="font-monostyle"
  >
    <sl-icon
      name=${inUse ? "check-circle" : "dash-circle"}
      class="mr-1.5"
    ></sl-icon>
    ${inUse ? msg("In Use") : msg("Not In Use")}
  </btrix-badge>`;

export const badges = (
  profile: Partial<Pick<Profile, "inUse" | "crawlerChannel" | "proxyId">>,
) => {
  return html`<div class="flex flex-wrap gap-3 whitespace-nowrap">
    ${profile.inUse === undefined ? nothing : usageBadge(profile.inUse)}
    ${when(
      profile.crawlerChannel,
      (channel) =>
        html`<btrix-badge class="font-monostyle">
          ${capitalize(channel)} ${msg("Channel")}</btrix-badge
        >`,
    )}
    ${when(
      profile.proxyId,
      (proxy) =>
        html`<btrix-badge class="font-monostyle">
          ${proxy} ${msg("Proxy")}</btrix-badge
        >`,
    )}
  </div> `;
};

export const badgesSkeleton = () =>
  html`<sl-skeleton class="h-4 w-12"></sl-skeleton>`;
