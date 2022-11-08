import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { CrawlConfig } from "../pages/archive/types";
import LiteElement, { html } from "../utils/LiteElement";
import type { AuthState } from "../utils/AuthService";
import { regexEscape } from "../utils/string";

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
 *   archiveId=${this.crawl.aid}
 *   crawlId=${this.crawl.id}
 *   .config=${this.crawlTemplate.config}
 *   .authState=${this.authState}
 *   ?isActiveCrawl=${isActive}
 * >
 * </btrix-exclusion-editor>
 * ```
 *
 * @event on-success On successful edit
 */
@localized()
export class ExclusionEditor extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ type: Array })
  config?: CrawlConfig;

  @property({ type: Boolean })
  isActiveCrawl = false;

  @state()
  private isSubmitting = false;

  @state()
  private exclusionFieldErrorMessage = "";

  @state()
  /** `new RegExp` constructor string */
  private regex: string = "";

  @state()
  matchedURLs: URLs | null = null;

  @state()
  private isLoading = false;

  willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("authState") ||
      changedProperties.has("archiveId") ||
      changedProperties.has("crawlId") ||
      changedProperties.has("regex")
    ) {
      this.fetchQueueMatches();
    }
  }

  render() {
    return html`
      ${this.renderTable()}
      ${this.isActiveCrawl && this.regex
        ? html` <section class="mt-5">${this.renderPending()}</section> `
        : ""}
      ${this.isActiveCrawl
        ? html` <section class="mt-5">${this.renderQueue()}</section> `
        : ""}
    `;
  }

  private renderTable() {
    return html`
      ${this.config
        ? html`<btrix-queue-exclusion-table
            .config=${this.config}
            @on-remove=${this.deleteExclusion}
          >
          </btrix-queue-exclusion-table>`
        : html`
            <div class="flex items-center justify-center my-9 text-xl">
              <sl-spinner></sl-spinner>
            </div>
          `}
      ${this.isActiveCrawl
        ? html`<div class="mt-2">
            <btrix-queue-exclusion-form
              ?isSubmitting=${this.isSubmitting}
              fieldErrorMessage=${this.exclusionFieldErrorMessage}
              @on-regex=${this.handleRegex}
              @submit=${this.onSubmit}
            >
            </btrix-queue-exclusion-form>
          </div>`
        : ""}
    `;
  }

  private renderPending() {
    return html`
      <btrix-crawl-pending-exclusions
        .matchedURLs=${this.matchedURLs}
      ></btrix-crawl-pending-exclusions>
    `;
  }

  private renderQueue() {
    return html`<btrix-crawl-queue
      archiveId=${this.archiveId!}
      crawlId=${this.crawlId!}
      .authState=${this.authState}
      regex=${this.regex}
      matchedTotal=${this.matchedURLs?.length || 0}
    ></btrix-crawl-queue>`;
  }

  private handleRegex(e: CustomEvent) {
    const { value, valid } = e.detail;

    if (valid) {
      this.regex = value;
    } else {
      this.regex = "";
    }
  }

  private async deleteExclusion(e: CustomEvent) {
    const { value } = e.detail;

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${this.crawlId}/exclusions?regex=${value}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      if (data.new_cid) {
        this.notify({
          message: msg(html`Removed exclusion: <code>${value}</code>`),
          type: "success",
          icon: "check2-circle",
        });

        this.dispatchEvent(
          new CustomEvent("on-success", {
            detail: { cid: data.new_cid },
          })
        );
      } else {
        throw data;
      }
    } catch (e: any) {
      this.notify({
        message:
          e.message === "crawl_running_cant_deactivate"
            ? msg("Cannot remove exclusion when crawl is no longer running.")
            : msg("Sorry, couldn't remove exclusion at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchQueueMatches() {
    if (!this.regex) {
      this.matchedURLs = null;
      return;
    }

    this.isLoading = true;

    try {
      const { matched } = await this.getQueueMatches();
      this.matchedURLs = matched;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't fetch pending exclusions at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isLoading = false;
  }

  private async getQueueMatches(): Promise<ResponseData> {
    const data: ResponseData = await this.apiFetch(
      `/archives/${this.archiveId}/crawls/${this.crawlId}/queueMatchAll?regex=${this.regex}`,
      this.authState!
    );

    return data;
  }

  private async onSubmit(e: CustomEvent) {
    this.isSubmitting = true;

    const { formData, onSuccess } = e.detail;
    const excludeType = formData.get("excludeType");
    const excludeValue = formData.get("excludeValue");
    let regex = excludeValue;

    if (excludeType === "text") {
      regex = regexEscape(excludeValue);
    }

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${this.crawlId}/exclusions?regex=${regex}`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.new_cid) {
        this.notify({
          message: msg("Exclusion added."),
          type: "success",
          icon: "check2-circle",
        });

        this.regex = "";
        this.matchedURLs = null;
        await this.updateComplete;

        onSuccess();
        this.dispatchEvent(
          new CustomEvent("on-success", {
            detail: { cid: data.new_cid },
          })
        );
      } else {
        throw data;
      }
    } catch (e: any) {
      if (e.message === "exclusion_already_exists") {
        this.exclusionFieldErrorMessage = msg("Exclusion already exists");
      } else {
        this.notify({
          message: msg("Sorry, couldn't add exclusion at this time."),
          type: "danger",
          icon: "exclamation-octagon",
        });
      }
    }

    this.isSubmitting = false;
  }
}
