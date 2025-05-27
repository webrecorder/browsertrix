import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { WorkflowScopeType } from "@/types/workflow";
import seededCrawlSvg from "~assets/images/new-crawl-config_Seeded-Crawl.svg";
import urlListSvg from "~assets/images/new-crawl-config_URL-List.svg";

export type SelectJobTypeEvent = CustomEvent<
  (typeof WorkflowScopeType)[keyof typeof WorkflowScopeType]
>;

/**
 * @event select-job-type SelectJobTypeEvent
 */
@customElement("btrix-new-workflow-dialog")
@localized()
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
                  detail: WorkflowScopeType.PageList,
                }),
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
                  detail: WorkflowScopeType.Prefix,
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
      </btrix-dialog>
    `;
  }

  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
