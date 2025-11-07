import { msg } from "@lit/localize";
import { html, nothing } from "lit";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";

import { CrawlerChannelImage, type Profile } from "@/types/crawler";

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
        html`<sl-tooltip content=${msg("Crawler Release Channel")}>
          <btrix-badge
            variant=${channel === CrawlerChannelImage.Default
              ? "neutral"
              : "blue"}
            class="font-monostyle"
          >
            <sl-icon name="boxes" class="mr-1.5"></sl-icon>
            ${capitalize(channel)}
          </btrix-badge>
        </sl-tooltip>`,
    )}
    ${when(
      profile.proxyId,
      (proxy) =>
        html`<sl-tooltip content=${msg("Crawler Proxy Server")}>
          <btrix-badge variant="blue" class="font-monostyle">
            <sl-icon name="globe2" class="mr-1.5"></sl-icon>
            ${proxy}
          </btrix-badge>
        </sl-tooltip>`,
    )}
  </div> `;
};

export const badgesSkeleton = () =>
  html`<sl-skeleton class="h-4 w-12"></sl-skeleton>`;
