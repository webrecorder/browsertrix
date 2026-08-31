import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { dashboardHeading } from "../layouts/dashboardHeading";
import { dashboardHeadingFor } from "../strings/dashboardHeading";
import { docsFeedback } from "../templates/docsFeedback";

import "./dashboard-guide-card";

import { BtrixElement } from "@/classes/BtrixElement";
import { docsEmail } from "@/constants/docs-email";
import { docsUrlContext, type DocsUrlContext } from "@/context/docs-url";
import { type BtrixUserGuideShowEvent } from "@/events/btrix-user-guide-show";
import { AnalyticsTrackEvent } from "@/trackEvents";
import { track, type AnalyticsTrackProps } from "@/utils/analytics";
import { tw } from "@/utils/tailwind";

const cardClasses = tw`col-span-full block h-full overflow-hidden @container/card @4xl/org:col-span-1 @4xl/org:rounded-lg @4xl/org:border`;

@customElement("btrix-dashboard-guides")
@localized()
export class DashboardGuides extends BtrixElement {
  @consume({ context: docsUrlContext })
  private readonly docsUrl?: DocsUrlContext;

  @property({ type: Boolean })
  showDocsEmail = false;

  render() {
    const trialing = this.appState.onboarding?.trialing;
    const hasUsage = !this.appState.onboarding?.noUsage;

    return html`<section class="mb-7">
        ${hasUsage ? this.renderGeneralGuides() : this.renderGettingStarted()}
      </section>

      ${when(
        !trialing,
        () => html`
          <section class="mb-10">
            ${hasUsage
              ? dashboardHeading(dashboardHeadingFor.crawlingGuides)
              : dashboardHeading(dashboardHeadingFor.newUserCrawlingGuides)}
            ${this.renderCrawlingGuides()}
          </section>
        `,
      )}
      ${when(
        !trialing || hasUsage,
        () =>
          html`${dashboardHeading(dashboardHeadingFor.exploreMoreGuides)}
            <sl-divider class="mb-5 mt-2"></sl-divider>
            ${this.renderSettingsGuides()}`,
      )}`;
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
            "Explore detailed guides on how to start web archiving with Browsertrix.",
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
            <span slot="title">${msg("User guide overview")}</span>
            ${msg("Find detailed documentation on topics and settings")}
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
            path="overview"
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

  private renderGeneralGuides() {
    return html`<div
      class="-mx-3 grid grid-cols-3 items-center gap-3 @4xl/org:mx-0"
    >
      <btrix-dashboard-guide-card
        class="${cardClasses} border-b"
        icon="easel"
        path="concepts"
      >
        <span slot="title">${msg("Introduction to concepts")}</span>
        ${msg("Read about Browsertrix concepts and terms")}
      </btrix-dashboard-guide-card>
      <btrix-dashboard-guide-card
        class="${cardClasses} border-b"
        icon="speedometer"
        path="overview"
      >
        <span slot="title">${msg("Your org dashboard")}</span>
        ${msg("Read about the features of your dashboard")}
      </btrix-dashboard-guide-card>
      <btrix-dashboard-guide-card
        class="${cardClasses}"
        icon="bookmarks"
        path="resources"
      >
        <span slot="title">${msg("Resources")}</span>
        ${msg("Links to general web archiving resources")}
      </btrix-dashboard-guide-card>
    </div>`;
  }

  private renderCrawlingGuides() {
    const trackProps = {
      trialing: this.appState.onboarding?.trialing,
      has_usage: this.appState.onboarding
        ? !this.appState.onboarding.noUsage
        : undefined,
    } satisfies AnalyticsTrackProps;

    return html`
      <div class="-mx-3 grid grid-cols-3 items-center gap-x-3 @4xl/org:mx-0">
        <btrix-dashboard-guide-card
          class="${cardClasses} border-b"
          icon="window"
          path="getting-started/#__tabbed_1_1"
          @click=${() =>
            track(AnalyticsTrackEvent.OpenedCrawlingOnePageGuide, trackProps)}
        >
          <span slot="title">${msg("One Page")}</span>
          ${msg("Archive a single page on a website")}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="${cardClasses} border-b"
          icon="person-workspace"
          path="getting-started/#__tabbed_1_2"
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
          class="${cardClasses}"
          icon="pc-display-horizontal"
          path="getting-started/#__tabbed_1_3"
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
    const sectionClasses = clsx(
      tw`col-span-full flex flex-col @5xl/org:text-xs`,
      this.showDocsEmail
        ? tw`@2xl/org:col-span-2 @5xl/org:col-span-1`
        : tw`@2xl/org:col-span-1`,
    );
    const headingClasses = tw`mb-3 text-base font-medium leading-6 @4xl/org:text-sm @5xl/org:mb-2`;
    const listClasses = tw`flex-1 [&>li:not(:last-of-type)]:mb-3.5`;

    return html`<div
      class="${this.showDocsEmail
        ? tw`grid-cols-4`
        : tw`grid-cols-3`} grid gap-x-3 gap-y-7"
    >
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

      ${when(this.showDocsEmail, () => docsFeedback(docsEmail))}
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
