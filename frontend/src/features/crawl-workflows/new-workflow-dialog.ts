import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import seededCrawlSvg from "~assets/images/new-crawl-config_Seeded-Crawl.svg";
import urlListSvg from "~assets/images/new-crawl-config_URL-List.svg";

export type SelectJobTypeEvent = CustomEvent<"url-list" | "seed-crawl">;

/**
 * @event select-job-type SelectJobTypeEvent
 */
@localized()
@customElement("btrix-new-workflow-dialog")
export class NewWorkflowDialog extends TailwindElement {
  @property({ type: Boolean })
  open = false;

  render() {
    return html`
      <btrix-dialog
        .label=${msg("What would you like to crawl?")}
        .open=${this.open}
        style="--width: 46rem"
      >
        <div
          class="mb-7 flex flex-col items-center justify-center gap-7 md:flex-row md:items-start md:gap-16"
        >
          <button
            class="group block w-[16.5rem] text-left"
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent("select-job-type", {
                  detail: "url-list",
                }) as SelectJobTypeEvent,
              );
            }}
          >
            <figure>
              <img
                class="block transition-transform group-hover:scale-105"
                src=${urlListSvg}
              />
              <figcaption class="p-1">
                <div
                  class="my-2 text-lg font-semibold leading-none transition-colors group-hover:text-primary-700"
                >
                  ${msg("Predetermined URLs")}
                </div>
                <p class="text-balance leading-normal text-neutral-700">
                  ${msg(
                    "Choose this option to crawl a single page, or if you already know the URL of every page you'd like to crawl.",
                  )}
                </p>
              </figcaption>
            </figure>
          </button>
          <button
            class="group block w-[16.5rem] text-left"
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent("select-job-type", {
                  detail: "seed-crawl",
                }) as SelectJobTypeEvent,
              );
            }}
          >
            <figure>
              <img
                class="block transition-transform group-hover:scale-105"
                src=${seededCrawlSvg}
              />
              <figcaption class="p-1">
                <div
                  class="my-2 text-lg font-semibold leading-none transition-colors group-hover:text-primary-700"
                >
                  ${msg("Automated Discovery")}
                </div>
                <p class="text-balance leading-normal text-neutral-700">
                  ${msg(
                    "Let the crawler automatically discover pages based on a domain or start page that you specify.",
                  )}
                </p>
              </figcaption>
            </figure>
          </button>
        </div>
        <sl-details
          summary=${msg("Need help deciding?")}
          @sl-hide=${this.stopProp}
          @sl-after-hide=${this.stopProp}
        >
          <p class="mb-3">
            ${msg(
              html`Choose <strong>Predetermined URLs</strong> (aka a "URL List"
                crawl type) if:`,
            )}
          </p>
          <ul class="mb-3 list-disc pl-5">
            <li>${msg("You want to archive a single page on a website")}</li>
            <li>
              ${msg("You're archiving just a few specific pages on a website")}
            </li>
            <li>
              ${msg("You have a list of URLs that you can copy-and-paste")}
            </li>
          </ul>
          <p class="mb-3">
            ${msg(
              html`A URL list is simpler to configure, since you don't need to
              worry about configuring the workflow to exclude parts of the
              website that you may not want to archive.`,
            )}
          </p>
          <p class="mb-3">
            ${msg(
              html`Choose <strong>Automated Discovery</strong> (aka a "Seeded
                Crawl" crawl type) if:`,
            )}
          </p>
          <ul class="mb-3 list-disc pl-5">
            <li>${msg("You want to archive an entire website")}</li>
            <li>
              ${msg(
                html`You're archiving a subset of a website, like everything
                  under <em>website.com/your-username</em>`,
              )}
            </li>
            <li>
              ${msg(
                html`You're archiving a website <em>and</em> external pages
                  linked to from the website`,
              )}
            </li>
          </ul>
          <p class="mb-3">
            ${msg(
              html`Seeded crawls are great for advanced use cases where you
              don't need to know every single URL that you want to archive. You
              can configure reasonable crawl limits and page limits so that you
              don't crawl more than you need to.`,
            )}
          </p>
          <p>
            ${msg(
              html`Once you choose a crawl type, you can't go back and change
                it. Check out the
                <a
                  class="text-blue-500 hover:text-blue-600"
                  href="https://docs.browsertrix.com/user-guide/workflow-setup/"
                  target="_blank"
                  >crawl workflow setup guide</a
                >
                if you still need help deciding on a crawl type, and try our
                <a
                  class="text-blue-500 hover:text-blue-600"
                  href="https://forum.webrecorder.net/c/help/5"
                  target="_blank"
                  >community help forum</a
                >.`,
            )}
          </p>
        </sl-details>
      </btrix-dialog>
    `;
  }

  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
