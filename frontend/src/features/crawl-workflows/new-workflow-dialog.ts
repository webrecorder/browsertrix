import { LitElement, html, css } from "lit";
import { property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import seededCrawlSvg from "~assets/images/new-crawl-config_Seeded-Crawl.svg";
import urlListSvg from "~assets/images/new-crawl-config_URL-List.svg";

export type SelectJobTypeEvent = CustomEvent<"url-list" | "seed-crawl">;

/**
 * @event select-job-type SelectJobTypeEvent
 */
@localized()
@customElement("btrix-new-workflow-dialog")
export class NewWorkflowDialog extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    .title,
    .container {
      margin: var(--sl-spacing-large) 0;
    }

    .container {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-spacing-4x-large);
      justify-content: center;
    }

    .heading {
      font-size: var(--sl-font-size-large);
      font-weight: var(--sl-font-weight-semibold);
      margin-top: 0;
      margin-bottom: var(--sl-spacing-small);
      line-height: 1;
    }

    .description {
      color: var(--sl-color-neutral-500);
      margin: 0;
    }

    .jobTypeButton {
      display: block;
      width: min-content;
      cursor: pointer;
    }

    figure {
      margin: 0;
      padding: 0;
    }

    .jobTypeButton:hover .jobTypeImg {
      transform: scale(1.05);
    }

    .jobTypeImg {
      transition-property: transform;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      transition-duration: 150ms;
      margin-bottom: var(--sl-spacing-small);
    }
  `;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  open = false;

  render() {
    return html`
      <btrix-dialog
        .label=${msg("Create a New Crawl Workflow")}
        .open=${this.open}
        style="--width: 46rem"
      >
        <h3 class="title heading">${msg("Choose Crawl Type")}</h3>
        <div class="container">
          <div
            role="button"
            class="jobTypeButton"
            @click=${() => {
              this.dispatchEvent(
                <SelectJobTypeEvent>new CustomEvent("select-job-type", {
                  detail: "url-list",
                })
              );
            }}
          >
            <figure>
              <img class="jobTypeImg" src=${urlListSvg} />
              <figcaption>
                <div class="heading">${msg("URL List")}</div>
                <p class="description">
                  ${msg(
                    "The crawler visits every URL specified in a list, and optionally every URL linked on those pages."
                  )}
                </p>
              </figcaption>
            </figure>
          </div>
          <div
            role="button"
            class="jobTypeButton"
            @click=${() => {
              this.dispatchEvent(
                <SelectJobTypeEvent>new CustomEvent("select-job-type", {
                  detail: "seed-crawl",
                })
              );
            }}
          >
            <figure>
              <img class="jobTypeImg" src=${seededCrawlSvg} />
              <figcaption>
                <div class="heading">${msg("Seeded Crawl")}</div>
                <p class="description">
                  ${msg(
                    "The crawler automatically discovers and archives pages starting from a single seed URL."
                  )}
                </p>
              </figcaption>
            </figure>
          </div>
        </div>
      </btrix-dialog>
    `;
  }
}
