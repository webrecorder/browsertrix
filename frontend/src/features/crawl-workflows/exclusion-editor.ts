import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { html, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import stylesheet from "./exclusion-editor.stylesheet.css";
import type {
  ExclusionAddEvent,
  ExclusionChangeEvent,
} from "./queue-exclusion-form";
import type { ExclusionRemoveEvent } from "./queue-exclusion-table";

import { BtrixElement } from "@/classes/BtrixElement";
import { type BtrixAddEvent } from "@/events/btrix-add";
import type { BtrixRemoveEvent } from "@/events/btrix-remove";
import type { SeedConfig } from "@/pages/org/types";
import { isApiError } from "@/utils/api";
import { isNotEqual } from "@/utils/is-not-equal";

const styles = unsafeCSS(stylesheet);

export type RemoveExclusionEvent = BtrixRemoveEvent<string>;
export type AddExclusionEvent = BtrixAddEvent<string>;

type URLs = string[];
type ResponseData = {
  total: number;
  matched: URLs;
};

/**
 * Crawl queue exclusion editor
 *
 * Usage example:
 * ```ts
 * <btrix-exclusion-editor
 *   crawlId=${this.crawl.id}
 *   .config=${this.workflow.config}
 *   ?isActiveCrawl=${isActive}
 * >
 * </btrix-exclusion-editor>
 * ```
 *
 * @fires btrix-add
 * @fires btrix-remove
 */
@customElement("btrix-exclusion-editor")
@localized()
export class ExclusionEditor extends BtrixElement {
  static styles = styles;

  @property({ type: String })
  crawlId?: string;

  @property({ attribute: false, hasChanged: isNotEqual })
  exclusions?: SeedConfig["exclude"];

  @property({ type: Boolean })
  isActiveCrawl = false;

  @property({ type: Boolean })
  submitting?: boolean;

  @property({ type: String })
  formErrorMessage = "";

  @state()
  /** `new RegExp` constructor string */
  private regex = "";

  private readonly getMatchesTask = new Task(this, {
    task: async ([crawlId, exclusions, regex], { signal }) => {
      if (!crawlId || !exclusions || !regex) return null;

      if (regex && exclusions.includes(this.regex)) {
        this.regex = "";
        return null;
      }

      try {
        const { matched } = await this.getQueueMatches(regex, signal);

        return matched;
      } catch (err) {
        if (signal.aborted) return;

        console.debug(err);

        if (isApiError(err) && err.message === "invalid_regex") {
          this.formErrorMessage = msg("Invalid Regex");
        }

        throw msg("Sorry, couldn't fetch pending exclusions at this time.");
      }
    },
    args: () => [this.crawlId, this.exclusions, this.regex],
  });

  render() {
    return html`
      <div
        class="grid size-full grid-cols-1 overflow-auto lg:grid-cols-2 lg:divide-x lg:overflow-hidden"
      >
        <div
          class="col-span-1 px-4 pt-4 lg:overflow-y-auto lg:overflow-x-hidden"
        >
          ${this.renderTable()}
        </div>
        <div class="col-span-1 flex flex-col lg:overflow-hidden">
          ${this.isActiveCrawl && this.regex
            ? html`<section
                class="lg:flex-0 px-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-auto"
              >
                ${this.renderPending()}
              </section>`
            : ""}
          ${this.isActiveCrawl
            ? html`<section class="px-4 lg:flex-1 lg:overflow-auto">
                ${this.renderQueue()}
              </section>`
            : ""}
        </div>
      </div>
    `;
  }

  private renderTable() {
    return html`
      ${this.exclusions
        ? html`<btrix-queue-exclusion-table
            pageSize="10"
            ?removable=${this.isActiveCrawl}
            .exclusions=${this.exclusions}
            @btrix-change=${async (e: ExclusionRemoveEvent) => {
              await this.updateComplete;
              const { index, regex } = e.detail;
              if (this.exclusions && index === 0 && !regex) {
                this.dispatchEvent(
                  new CustomEvent<RemoveExclusionEvent["detail"]>(
                    "btrix-remove",
                    {
                      detail: { item: this.exclusions[index] },
                    },
                  ),
                );
              }
            }}
            @btrix-remove=${(e: ExclusionRemoveEvent) =>
              this.dispatchEvent(
                new CustomEvent<RemoveExclusionEvent["detail"]>(
                  "btrix-remove",
                  {
                    detail: { item: e.detail.regex },
                  },
                ),
              )}
          >
          </btrix-queue-exclusion-table>`
        : html`
            <div class="my-9 flex items-center justify-center text-xl">
              <sl-spinner></sl-spinner>
            </div>
          `}
      ${this.isActiveCrawl
        ? html`<div
            class="sticky bottom-0 [container-name:sticky-form] [container-type:scroll-state]"
          >
            <div class="form-wrapper bg-white py-2">
              <btrix-queue-exclusion-form
                regex=${this.regex}
                ?isSubmitting=${this.submitting}
                fieldErrorMessage=${this.formErrorMessage}
                @btrix-change=${this.handleRegexChange}
                @btrix-add=${this.handleAddRegex}
              >
              </btrix-queue-exclusion-form>
            </div>
          </div>`
        : ""}
    `;
  }

  private renderPending() {
    const errorMessage = this.getMatchesTask.render({
      error: (errorMessage) => errorMessage,
    });

    return html`
      <btrix-crawl-pending-exclusions
        class="part-[heading]:sticky part-[heading]:top-0 part-[heading]:z-20 part-[heading]:bg-white part-[heading]:pt-1.5"
        .matchedURLs=${this.getMatchesTask.value ?? null}
        ?loading=${this.getMatchesTask.status === TaskStatus.PENDING}
        errorMessage=${ifDefined(
          typeof errorMessage === "string" ? errorMessage : undefined,
        )}
      ></btrix-crawl-pending-exclusions>
    `;
  }

  private renderQueue() {
    return html`<btrix-crawl-queue
      class="part-[heading]:sticky part-[heading]:top-0 part-[heading]:z-10 part-[heading]:block part-[heading]:bg-white part-[heading]:pt-1.5"
      crawlId=${this.crawlId!}
      regex=${this.regex}
      .exclusions=${this.exclusions || []}
      matchedTotal=${this.getMatchesTask.value?.length || 0}
    ></btrix-crawl-queue>`;
  }

  private handleRegexChange(e: ExclusionChangeEvent) {
    const { value, valid } = e.detail;

    if (valid) {
      this.regex = value;
    } else {
      this.regex = "";
    }
  }

  private async getQueueMatches(regex: string, signal: AbortSignal) {
    const params = new URLSearchParams({ regex });
    const data = await this.api.fetch<ResponseData>(
      `/orgs/${this.orgId}/crawls/${
        this.crawlId
      }/queueMatchAll?${params.toString()}`,
      { signal },
    );

    return data;
  }

  async handleAddRegex(e?: ExclusionAddEvent) {
    const regex = e?.detail.regex ?? this.regex;

    if (regex) {
      this.dispatchEvent(
        new CustomEvent<AddExclusionEvent["detail"]>("btrix-add", {
          detail: { item: regex },
        }),
      );
    }
  }

  async onClose() {
    if (this.regex && this.isActiveCrawl) {
      await this.handleAddRegex();
    }
  }
}
