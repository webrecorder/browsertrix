import { msg } from "@lit/localize";
import { html, nothing } from "lit";
import { when } from "lit/directives/when.js";

import { type Profile } from "@/types/crawler";

export const usageBadge = (inUse: boolean) =>
  html`<sl-tooltip
    content=${inUse
      ? msg("In Use by Crawl Workflow")
      : msg("Not in Use by Crawl Workflow")}
  >
    <btrix-badge variant=${inUse ? "cyan" : "neutral"}>
      <sl-icon
        name=${inUse ? "check-circle" : "dash-circle"}
        class="mr-1.5"
      ></sl-icon>
      ${inUse ? msg("In Use") : msg("Not in Use")}
    </btrix-badge>
  </sl-tooltip>`;

export const badges = (
  profile: Partial<Pick<Profile, "inUse" | "crawlerChannel" | "proxyId">>,
) => {
  return html`<div class="flex flex-wrap gap-3 whitespace-nowrap">
    ${profile.inUse === undefined ? nothing : usageBadge(profile.inUse)}
    ${when(
      profile.crawlerChannel,
      (channelImage) => html`
        <btrix-crawler-channel-badge
          channelId=${channelImage}
        ></btrix-crawler-channel-badge>
      `,
    )}
    ${when(
      profile.proxyId,
      (proxyId) => html`
        <btrix-proxy-badge proxyId=${proxyId}></btrix-proxy-badge>
      `,
    )}
  </div> `;
};

export const badgesSkeleton = () =>
  html`<sl-skeleton class="h-4 w-12"></sl-skeleton>`;
