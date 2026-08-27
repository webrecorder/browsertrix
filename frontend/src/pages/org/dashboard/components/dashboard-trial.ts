import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { dashboardHeading } from "../layouts/dashboardHeading";

import "./dashboard-guide-card";

import { BtrixElement } from "@/classes/BtrixElement";
import { AnalyticsTrackEvent } from "@/trackEvents";
import { track, type AnalyticsTrackProps } from "@/utils/analytics";
import { tw } from "@/utils/tailwind";

@customElement("btrix-dashboard-trial")
@localized()
export class DashboardTrial extends BtrixElement {
  render() {
    return html`
      <section>${this.renderIntro()}</section>

      <section>
        ${dashboardHeading(msg("What would you like to archive?"))}
        ${this.renderCrawlingGuides()}
      </section>
    `;
  }

  private renderIntro() {
    return html`<header class="mb-7">
      <p class="mb-2 text-xl font-semibold">
        ${msg("Welcome to Browsertrix.")}
      </p>
      <p class="text-neutral-700">
        ${msg(
          "Your dashboard is customized with guides and resources to help you get the most out of your trial experience.",
        )}
      </p>
    </header> `;
  }

  private renderCrawlingGuides() {
    const cardClasses = tw`col-span-full block h-full @container/card @xl/org:col-span-1`;

    const trackProps = {
      trialing: this.appState.onboarding?.trialing,
      has_usage: this.appState.onboarding
        ? !this.appState.onboarding.noUsage
        : undefined,
    } satisfies AnalyticsTrackProps;

    return html`
      <div class="grid grid-cols-3 items-center gap-3">
        <btrix-dashboard-guide-card
          class="${cardClasses} part-[icon-background]:bg-emerald-50 part-[icon]:text-emerald-500"
          icon="window"
          path="getting-started/#__tabbed_1_1"
          variant="button"
          @click=${() =>
            track(AnalyticsTrackEvent.OpenedCrawlingOnePageGuide, trackProps)}
        >
          <span slot="title">${msg("One Page")}</span>
          <span slot="label">${msg("Start Here")}</span>
          ${msg("Archive a single page on a website")}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="${cardClasses} part-[icon-background]:bg-rose-50 part-[icon]:text-rose-500"
          icon="person-workspace"
          path="getting-started/#__tabbed_1_2"
          variant="button"
          @click=${() =>
            track(
              AnalyticsTrackEvent.OpenedCrawlingSocialMediaGuide,
              trackProps,
            )}
        >
          <span slot="title">${msg("Social Media Page")}</span>
          <span slot="label">${msg("Start Here")}</span>
          ${msg("Archive a social media post or profile")}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="${cardClasses} part-[icon-background]:bg-indigo-50 part-[icon]:text-indigo-500"
          icon="pc-display-horizontal"
          path="getting-started/#__tabbed_1_3"
          variant="button"
          @click=${() =>
            track(AnalyticsTrackEvent.OpenedCrawlingWebsiteGuide, trackProps)}
        >
          <span slot="title">${msg("Entire Website")}</span>
          <span slot="label">${msg("Start Here")}</span>
          ${msg("Archive every page on a website")}
        </btrix-dashboard-guide-card>
      </div>
    `;
  }
}
