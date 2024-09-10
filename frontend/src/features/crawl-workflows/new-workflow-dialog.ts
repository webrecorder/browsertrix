import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { FormState as WorkflowFormState } from "@/utils/workflow";
import seededCrawlSvg from "~assets/images/new-crawl-config_Seeded-Crawl.svg";
import urlListSvg from "~assets/images/new-crawl-config_URL-List.svg";

export type SelectJobTypeEvent = CustomEvent<WorkflowFormState["scopeType"]>;

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
          class="mb-7 mt-5 flex flex-col items-center justify-center gap-6 md:flex-row md:items-start md:gap-16"
        >
          <button
            class="group block w-[17rem] text-left"
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent("select-job-type", {
                  detail: "page-list",
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
                <div class="leading none my-2 font-semibold">
                  <div class="transition-colors group-hover:text-primary-700">
                    ${msg("Page Crawl")}:
                  </div>
                  <div class="text-lg">${msg("One or more page URLs")}</div>
                </div>
                <p class="leading-normal text-neutral-700">
                  ${msg(
                    "Choose this option if you know the URL of every page you'd like to crawl and don't need to include any additional pages beyond one hop out.",
                  )}
                </p>
              </figcaption>
            </figure>
          </button>
          <button
            class="group block w-[17rem] text-left"
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent("select-job-type", {
                  detail: "prefix",
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
                <div class="leading none my-2 font-semibold">
                  <div class="transition-colors group-hover:text-primary-700">
                    ${msg("Site Crawl")}:
                  </div>
                  <div class="text-lg">
                    ${msg("Entire website or directory")}
                  </div>
                </div>
                <p class="leading-normal text-neutral-700">
                  ${msg(
                    "Specify a domain name, start page URL, or path on a website and let the crawler automatically find pages within that scope.",
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
            ${msg(html`Choose <strong>Page Crawl</strong> if:`)}
          </p>
          <ul class="mb-3 list-disc pl-5">
            <li>${msg("You want to archive a single page on a website")}</li>
            <li>
              ${msg("You have a list of URLs that you can copy-and-paste")}
            </li>
            <li>
              ${msg(
                "You want to include URLs with different domain names in the same crawl",
              )}
            </li>
          </ul>
          <p class="mb-3">
            ${msg(
              html`A Page Crawl workflow is simpler to configure, since you
              don't need to worry about configuring the workflow to exclude
              parts of the website that you may not want to archive.`,
            )}
          </p>
          <p class="mb-3">
            ${msg(html`Choose <strong>Site Crawl</strong> if:`)}
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
              html`Site Crawl workflows are great for advanced use cases where
              you don't need to know every single URL that you want to archive.
              You can configure reasonable crawl limits and page limits so that
              you don't crawl more than you need to.`,
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
