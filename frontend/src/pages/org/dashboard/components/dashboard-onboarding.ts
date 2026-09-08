import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { dashboardHeading } from "../layouts/dashboardHeading";
import { dashboardHeadingFor } from "../strings/dashboardHeading";

import { BtrixElement } from "@/classes/BtrixElement";
import { AnalyticsTrackEvent } from "@/trackEvents";
import { track, type AnalyticsTrackProps } from "@/utils/analytics";
import { tw } from "@/utils/tailwind";

import "./dashboard-guide-card";

@customElement("btrix-dashboard-onboarding")
@localized()
export class DashboardOnboarding extends BtrixElement {
  render() {
    return html`
      <header class="mb-7">${this.renderIntro()}</header>

      <section class="mb-7">
        ${dashboardHeading(dashboardHeadingFor.newUserCrawlingGuides)}
        ${this.renderCrawlingGuides()}
      </section>

      <section>
        ${dashboardHeading(dashboardHeadingFor.exploreMoreGuides)}
        ${this.renderGettingStarted()}
      </section>
    `;
  }

  private renderIntro() {
    return html`<p class="text-xl font-semibold">
        ${msg("Welcome to Browsertrix")}
      </p>
      <p class="mt-2 text-neutral-700">
        ${this.appState.isTrialing
          ? msg(
              "Your dashboard is customized with guides and resources to help you get the most out of your trial experience.",
            )
          : msg(
              "Your dashboard is customized with guides and resources to help you get started.",
            )}
      </p>`;
  }

  private renderGettingStarted() {
    return html`<div
      class="col-span-full grid grid-cols-3 gap-x-3 gap-y-7 @4xl/org:rounded-lg @4xl/org:border"
    >
      <div
        class="col-span-full flex flex-col justify-center gap-3 py-3 @4xl/org:col-span-1 @4xl/org:p-5"
      >
        <h2 class="text-base font-medium leading-6">
          ${msg("Getting Started")}
        </h2>
        <p class="text-pretty">
          ${msg(
            "Find detailed documentation on topics and settings in the Browsertrix user guide.",
          )}
        </p>
        <p class="text-pretty">
          ${msg(
            "You can access the user guide at any time from the button at the top of every page.",
          )}
        </p>
      </div>
      <div
        class="col-span-full -mx-3 @container/card @4xl/org:col-span-2 @4xl/org:mx-0 @4xl/org:border-l"
      >
        <div>
          <btrix-dashboard-guide-card
            class="block @lg/card:border-b"
            icon="book-half"
            path=""
          >
            <span slot="title">${msg("Introduction to the user guide")}</span>
            ${msg(
              "An overview of how to navigate and find information in the guide",
            )}
          </btrix-dashboard-guide-card>
          <btrix-dashboard-guide-card
            class="block @lg/card:border-b"
            icon="easel"
            path="concepts"
          >
            <span slot="title">${msg("Introduction to concepts")}</span>
            ${msg(
              "Familiarize yourself with concepts and terms used throughout Browsertrix",
            )}
          </btrix-dashboard-guide-card>
          <btrix-dashboard-guide-card
            class="block"
            icon="building-fill-gear"
            path="settings"
          >
            <span slot="title">${msg("Setting up your org")}</span>
            ${msg(
              "Manage your subscription, edit the name, invite team members, and more",
            )}
          </btrix-dashboard-guide-card>
        </div>
      </div>
    </div>`;
  }

  private renderCrawlingGuides() {
    const cardClasses = tw`col-span-full block h-full @container/card @xl/org:col-span-1`;

    const trackProps = {
      trialing: this.appState.isTrialing,
      has_usage: this.org ? this.org.bytesStored > 0 : undefined,
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
          ${msg("Archive every page on a website")}
        </btrix-dashboard-guide-card>
      </div>
    `;
  }
}
