import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { primaryHeading } from "../layouts/primaryHeading";

import { BtrixElement } from "@/classes/BtrixElement";
import { docsUrlContext, type DocsUrlContext } from "@/context/docs-url";
import { type BtrixUserGuideShowEvent } from "@/events/btrix-user-guide-show";
import { tw } from "@/utils/tailwind";

import "./dashboard-guide-card";

@customElement("btrix-dashboard-guides")
@localized()
export class DashboardGuides extends BtrixElement {
  @consume({ context: docsUrlContext })
  private readonly docsUrl?: DocsUrlContext;

  render() {
    const trialing = this.appState.onboarding?.trialing;
    const noUsage = this.appState.onboarding?.noUsage;

    return html`<section class="mb-7">
        ${noUsage ? this.renderGettingStarted() : this.renderGeneralGuides()}
      </section>

      ${when(
        !trialing,
        () => html`
          <section class="mb-7">
            ${primaryHeading(msg("Crawling Guides"))}
            ${this.renderCrawlingGuides()}
          </section>
        `,
      )}

      <div>${this.renderSettingsGuides()}</div>`;
  }

  private renderGettingStarted() {
    return html`<div
      class="col-span-full grid grid-cols-3 gap-x-3 gap-y-7 lg:rounded-lg lg:border"
    >
      <div
        class="col-span-full flex flex-col justify-center gap-3 py-3 lg:col-span-1 lg:p-5"
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
        class="col-span-full -mx-3 @container lg:col-span-2 lg:mx-0 lg:border-l"
      >
        <div>
          <btrix-dashboard-guide-card
            class="block @lg:border-b"
            icon="book-half"
            path=""
          >
            <span slot="title">${msg("User guide overview")}</span>
            ${msg("Find detailed documentation on topics and settings")}
          </btrix-dashboard-guide-card>
          <btrix-dashboard-guide-card
            class="block @lg:border-b"
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
    return html`<div class="-mx-3 grid grid-cols-3 items-center gap-3 lg:mx-0">
      <btrix-dashboard-guide-card
        class="col-span-full block h-full overflow-hidden border-b @container lg:col-span-1 lg:rounded-lg lg:border"
        icon="book-half"
        path=""
      >
        <span slot="title">${msg("Introduction to the user guide")}</span>
        ${msg("Find detailed documentation on topics and settings")}
      </btrix-dashboard-guide-card>
      <btrix-dashboard-guide-card
        class="col-span-full block h-full overflow-hidden border-b @container lg:col-span-1 lg:rounded-lg lg:border"
        icon="speedometer"
        path="overview"
      >
        <span slot="title">${msg("Your org dashboard")}</span>
        ${msg("Read about the features of your dashboard")}
      </btrix-dashboard-guide-card>
      <btrix-dashboard-guide-card
        class="col-span-full block h-full overflow-hidden @container lg:col-span-1 lg:rounded-lg lg:border"
        icon="bookmarks"
        path="resources"
      >
        <span slot="title">${msg("Resources")}</span>
        ${msg("Links to general web archiving resources")}
      </btrix-dashboard-guide-card>
    </div>`;
  }

  private renderCrawlingGuides() {
    return html`
      <div class="-mx-3 grid grid-cols-3 items-center gap-x-3 lg:mx-0">
        <btrix-dashboard-guide-card
          class="col-span-full block h-full overflow-hidden border-b @container lg:col-span-1 lg:rounded-lg lg:border"
          icon="window"
          path="getting-started/#__tabbed_1_1"
        >
          <span slot="title">${msg("One Page")}</span>
          <span slot="label">${msg("Read Guide")}</span>
          ${msg("Archive a single page on a website")}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="col-span-full block h-full overflow-hidden border-b @container lg:col-span-1 lg:rounded-lg lg:border"
          icon="person-workspace"
          path="getting-started/#__tabbed_1_2"
        >
          <span slot="title">${msg("Social Media Page")}</span>
          <span slot="label">${msg("Read Guide")}</span>
          ${msg("Archive a social media post or profile")}
        </btrix-dashboard-guide-card>
        <btrix-dashboard-guide-card
          class="col-span-full block h-full overflow-hidden @container lg:col-span-1 lg:rounded-lg lg:border"
          icon="pc-display-horizontal"
          path="getting-started/#__tabbed_1_3"
        >
          <span slot="title">${msg("Entire Website")}</span>
          <span slot="label">${msg("Read Guide")}</span>
          ${msg("Archive every page on a website")}
        </btrix-dashboard-guide-card>
      </div>
    `;
  }

  private renderSettingsGuides() {
    return html`<div class="grid grid-cols-3 gap-x-3 gap-y-7">
      <section class="col-span-full flex flex-col lg:col-span-1">
        <h3 class="mb-3 font-medium leading-6">${msg("Crawl Settings")}</h3>
        <ul class="${tw`[&>li:not(:last-of-type)]:mb-3.5`} flex-1">
          <li>
            ${this.renderGuideLink({
              label: msg("Exclude pages from the crawl"),
              icon: "file-earmark-minus",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Organize crawls into collections"),
              icon: "collection",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Review, rate, and comment on crawled content"),
              icon: "chat-square-text",
              path: "",
            })}
          </li>
        </ul>
      </section>
      <section class="col-span-full flex flex-col lg:col-span-1">
        <h3 class="mb-3 font-medium leading-6">${msg("Org Settings")}</h3>
        <ul class="${tw`[&>li:not(:last-of-type)]:mb-3.5`} flex-1">
          <li>
            ${this.renderGuideLink({
              label: msg("Your org dashboard"),
              icon: "speedometer2",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Invite team members"),
              icon: "people-fill",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Manage billing"),
              icon: "credit-card-fill",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Create a public archive"),
              icon: "globe",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Enable deduplication"),
              icon: "stack",
              path: "",
            })}
          </li>
        </ul>
      </section>
      <section class="col-span-full flex flex-col lg:col-span-1">
        <h3 class="mb-3 font-medium leading-6">${msg("Account Settings")}</h3>
        <ul class="${tw`[&>li:not(:last-of-type)]:mb-3.5`} flex-1">
          <li>
            ${this.renderGuideLink({
              label: msg("Change your email"),
              icon: "person-badge",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Change your password"),
              icon: "shield-lock-fill",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Choose your preferred language"),
              icon: "translate",
              path: "",
            })}
          </li>
          <li>
            ${this.renderGuideLink({
              label: msg("Change how your name appears to team members"),
              icon: "file-person-fill",
              path: "",
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
        class="leading-4 text-primary-700 hover:underline"
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
