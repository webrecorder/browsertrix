import { msg } from "@lit/localize";
import clsx from "clsx";
import { html, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function generalGuides({
  onboarding,
  trialing,
  billing,
  classes,
}: {
  onboarding?: boolean;
  trialing?: boolean;
  billing?: boolean;
  classes?: string;
} = {}) {
  const cards: TemplateResult[] = [];

  if (onboarding) {
    cards.push(
      html`<btrix-dashboard-guide-card
          class="block @lg/card:border-b part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
          icon="easel"
          path="concepts"
        >
          <span slot="title">${msg("Introduction to Concepts")}</span>
          ${msg(html`An overview of concepts & terms used in Browsertrix`)}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="block @lg/card:border-b part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
          icon="map"
          path="navigation"
        >
          <span slot="title">${msg("Navigating Your Org")}</span>
          ${msg("Where to find org features and reference guides")}
        </btrix-dashboard-guide-card> `,
    );

    if (trialing) {
      cards.push(
        html`<btrix-dashboard-guide-card
          class="block part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
          icon="calendar3"
          path="signup/#your-free-trial"
        >
          <span slot="title">${msg("Your Free Trial")}</span>
          ${msg("How to get the most out of your trial experience")}
        </btrix-dashboard-guide-card>`,
      );
    } else {
      cards.push(
        html`<btrix-dashboard-guide-card
          class="block part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
          icon="building-fill-gear"
          path="org-settings"
        >
          <span slot="title">${msg("Org Settings")}</span>
          ${billing
            ? msg("Manage your plan, invite team members, and more")
            : msg("Change your org name, invite team members, and more")}
        </btrix-dashboard-guide-card>`,
      );
    }
  } else {
    cards.push(
      html`<btrix-dashboard-guide-card
          class="block @lg/card:border-b part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
          icon="speedometer"
          path="overview"
        >
          <span slot="title">${msg("Org Dashboard")}</span>
          ${msg("Read about the features of your dashboard")}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="block @lg/card:border-b part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
          icon="gear-wide-connected"
          path="crawl-workflows"
        >
          <span slot="title">${msg("Crawl Workflows")}</span>
          ${msg("Learn how to schedule, run, and manage crawls")}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="block @lg/card:border-b part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
          icon="unlock"
          path="browser-profiles/browser-profiles-overview"
        >
          <span slot="title">${msg("Browser Profiles")}</span>
          ${msg("Learn how to address crawl impediments like login prompts")}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="block part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
          icon="archive"
          path="collection"
        >
          <span slot="title">${msg("Collections")}</span>
          ${msg(
            "Learn how to combine, de-duplicate, and share crawled content",
          )}
        </btrix-dashboard-guide-card> `,
    );
  }

  return html`
    <div
      class=${clsx(
        tw`-mx-3 @lg/card:mx-0 @lg/card:overflow-hidden @lg/card:rounded-lg @lg/card:border`,
        classes,
      )}
    >
      ${cards}
    </div>
  `;
}
