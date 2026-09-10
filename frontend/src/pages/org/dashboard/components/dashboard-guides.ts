import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { dashboardHeading } from "../layouts/dashboardHeading";

import { BtrixElement } from "@/classes/BtrixElement";
import { docsUrlContext, type DocsUrlContext } from "@/context/docs-url";
import { type BtrixUserGuideShowEvent } from "@/events/btrix-user-guide-show";
import { AnalyticsTrackEvent } from "@/trackEvents";
import { track, type AnalyticsTrackProps } from "@/utils/analytics";
import { hasUsage } from "@/utils/orgs";
import { tw } from "@/utils/tailwind";

import "./dashboard-guide-card";

@customElement("btrix-dashboard-guides")
@localized()
export class DashboardGuides extends BtrixElement {
  @consume({ context: docsUrlContext })
  private readonly docsUrl?: DocsUrlContext;

  @property({ type: Boolean })
  onboarding = false;

  render() {
    return html`
      <section class="mb-7">
        ${this.onboarding
          ? this.renderGettingStarted()
          : html`<div class="overflow-hidden rounded-lg border">
              ${this.renderGeneralGuides()}
            </div>`}
      </section>

      <section class="mb-7">
        ${this.onboarding
          ? html` <div class="flex flex-wrap items-baseline gap-x-1.5">
              ${dashboardHeading(msg("Quick Start"))}
              <p class="mb-2 leading-6 text-neutral-600">
                ${msg("What would you like to archive?")}
              </p>
            </div>`
          : dashboardHeading(msg("Crawling"))}
        ${this.renderCrawlingGuides()}
      </section>

      <sl-details
        class="part-[content]:p-3 part-[header]:p-3 part-[summary]:font-medium part-[content]:[border-top:solid_1px_var(--sl-panel-border-color)]"
      >
        <div slot="summary" class="flex items-center gap-3">
          <sl-icon class="size-5 text-neutral-500" name="book"></sl-icon>
          <strong class="font-medium">${msg("More Guides")}</strong>
        </div>
        ${this.renderSettingsGuides()}
      </sl-details>
    `;
  }

  private renderGettingStarted() {
    return html`<div
      class="col-span-full grid grid-cols-3 gap-x-3 gap-y-7 @4xl/org:rounded-lg @4xl/org:border"
    >
      <div
        class="col-span-full flex flex-col gap-3 py-3 @4xl/org:col-span-1 @4xl/org:p-5"
      >
        <div class="flex flex-1 flex-col justify-center gap-2.5">
          ${dashboardHeading(msg("Getting Started"), {
            leading: false,
          })}
          <p class="text-pretty">
            ${msg(
              "Whether you’re new to web archiving or Browsertrix, we have guides to help you get started.",
            )}
          </p>
        </div>
      </div>
      <div
        class="col-span-full -mx-3 @4xl/org:col-span-2 @4xl/org:mx-0 @4xl/org:border-l"
      >
        ${this.renderGeneralGuides()}
      </div>
    </div>`;
  }

  private renderGeneralGuides() {
    return html`<div class="@container/card">
      ${this.onboarding
        ? html`<btrix-dashboard-guide-card
            class="block @lg/card:border-b part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
            icon="easel"
            path="concepts"
          >
            <span slot="title">${msg("Introduction to Concepts")}</span>
            ${msg(html`An overview of concepts & terms used in Browsertrix`)}
          </btrix-dashboard-guide-card>`
        : html`<btrix-dashboard-guide-card
            class="block @lg/card:border-b part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
            icon="speedometer"
            path="overview"
          >
            <span slot="title">${msg("Org Dashboard")}</span>
            ${msg("Read about the features of your dashboard")}
          </btrix-dashboard-guide-card>`}
      <btrix-dashboard-guide-card
        class="block @lg/card:border-b part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
        icon="map"
        path="navigation"
      >
        <span slot="title">${msg("Navigating Your Org")}</span>
        ${msg("Where to find org features and reference guides")}
      </btrix-dashboard-guide-card>
      ${this.appState.isTrialing
        ? html`<btrix-dashboard-guide-card
            class="block part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
            icon="calendar3"
            path="signup/#your-free-trial"
          >
            <span slot="title">${msg("Your Free Trial")}</span>
            ${msg("How to get the most out of your trial experience")}
          </btrix-dashboard-guide-card>`
        : html`<btrix-dashboard-guide-card
            class="block part-[icon-background]:bg-lime-50 part-[icon]:text-lime-500"
            icon="building-fill-gear"
            path="org-settings"
          >
            <span slot="title">${msg("Org Settings")}</span>
            ${this.appState.settings?.billingEnabled
              ? msg("Manage your plan, invite team members, and more")
              : msg("Change your org name, invite team members, and more")}
          </btrix-dashboard-guide-card>`}
    </div>`;
  }

  private renderCrawlingGuides() {
    const cardClasses = tw`col-span-full block h-full @container/card @xl/org:col-span-1`;

    const trackProps = {
      trialing: this.appState.isTrialing,
      has_usage: hasUsage(this.org),
    } satisfies AnalyticsTrackProps;

    return html`
      <div class="grid grid-cols-3 items-center gap-3">
        <btrix-dashboard-guide-card
          class="${cardClasses} part-[icon-background]:bg-sky-100 part-[icon]:text-sky-600"
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
          class="${cardClasses} part-[icon-background]:bg-fuchsia-100 part-[icon]:text-fuchsia-600"
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
          class="${cardClasses} part-[icon-background]:bg-emerald-100 part-[icon]:text-emerald-600"
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

  private renderSettingsGuides() {
    const sectionClasses = tw`col-span-full flex flex-col @2xl/org:col-span-1`;
    const headingClasses = tw`mb-3 text-base font-medium leading-6 @4xl/org:text-sm`;
    const listClasses = tw`flex-1 [&>li:not(:last-of-type)]:mb-3.5`;

    return html`<div class="grid grid-cols-3 gap-x-3 gap-y-7">
      <section class="${sectionClasses}">
        <h3 class="${headingClasses}">${msg("Crawl Settings")}</h3>
        <ul class="${listClasses}">
          <li>
            ${this.renderGuideLink({
              label: msg("Exclude pages from the crawl"),
              icon: "file-earmark-minus",
              path: "workflow-setup/#exclude-pages",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Exclude popups and prompts"),
              icon: "window-dash",
              path: "browser-profiles/browser-profiles-overview",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Watch pages in real-time"),
              icon: "eye-fill",
              path: "running-crawl/#watch-crawl",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Avoid crawler traps in real-time"),
              icon: "shield-exclamation",
              path: "running-crawl/#live-exclusion-editing",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Organize crawls into collections"),
              icon: "collection",
              path: "collection",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Review, rate, and comment on crawled content"),
              icon: "chat-square-text",
              path: "quality-assurance",
            })}
          </li>
        </ul>
      </section>
      <section class="${sectionClasses}">
        <h3 class="${headingClasses}">${msg("Org Settings")}</h3>
        <ul class="${listClasses}">
          <li>
            ${this.renderGuideLink({
              label: msg("Manage billing"),
              icon: "credit-card-fill",
              path: "org-settings/#billing",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Invite team members"),
              icon: "people-fill",
              path: "org-members",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Import a collection"),
              icon: "box-arrow-in-down",
              path: "archived-items/#uploading-web-archives",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Create a public archive"),
              icon: "globe",
              path: "public-collections-gallery",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Enable deduplication"),
              icon: "stack",
              path: "deduplication/#enable-deduplication-across-your-entire-organization",
            })}
          </li>
        </ul>
      </section>
      <section class="${sectionClasses}">
        <h3 class="${headingClasses}">${msg("Account Settings")}</h3>
        <ul class="${listClasses}">
          <li>
            ${this.renderGuideLink({
              label: msg("Change your email"),
              icon: "person-badge",
              path: "user-settings",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Change your password"),
              icon: "shield-lock-fill",
              path: "change-password/#change-password",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Choose your preferred language"),
              icon: "translate",
              path: "user-settings",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Change how your name appears to team members"),
              icon: "file-person-fill",
              path: "user-settings",
            })}
          </li>
        </ul>
      </section>
    </div>`;
  }

  private readonly renderGuideLink = ({
    label,
    icon,
    path,
  }: {
    label: string;
    icon: string;
    path: string;
  }) => {
    const link = `${this.docsUrl}user-guide/${path}`;

    return html`<div class="flex gap-2">
      <div class="flex h-4 shrink-0 grow-0 items-center">
        <sl-icon class="text-neutral-500" name=${icon}></sl-icon>
      </div>
      <a
        class="max-w-[30ch] leading-4 text-primary-700 hover:underline"
        href=${link}
        @click=${(e: MouseEvent) => {
          if (!e.metaKey) {
            e.preventDefault();

            this.dispatchEvent(
              new CustomEvent<BtrixUserGuideShowEvent["detail"]>(
                "btrix-user-guide-show",
                {
                  detail: { path },
                  bubbles: true,
                  composed: true,
                },
              ),
            );
          }
        }}
        >${label}</a
      >
    </div>`;
  };
}
