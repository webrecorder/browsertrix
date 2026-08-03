import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import type {
  SlChangeEvent,
  SlInput,
  SlInputEvent,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import throttle from "lodash/fp/throttle";

import { BtrixElement } from "@/classes/BtrixElement";
import type { IntersectEvent } from "@/controllers/observable";
import { isApiError } from "@/utils/api";
import { tw } from "@/utils/tailwind";

type Pages = string[];
export type ResponseData = {
  total: number;
  results: Pages;
  matched: Pages;
};

const POLL_INTERVAL_SECONDS = 5;

/**
 * Show real-time crawl queue results
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-queue
 *   crawlId=${this.crawl.id}
 *   regex="skip-me"
 * ></btrix-crawl-queue>
 * ```
 *
 * @cssPart heading
 */
@customElement("btrix-crawl-queue")
@localized()
export class CrawlQueue extends BtrixElement {
  @property({ type: String })
  crawlId?: string;

  @property({ type: Number })
  matchedTotal?: number;

  @property({ type: String })
  /** `new RegExp` constructor string */
  regex = "";

  @property({ type: Array })
  exclusions: string[] = [];

  /**
   * Crawl is starting
   */
  @property({ type: Boolean })
  starting?: Boolean;

  /**
   * Prevent polling
   */
  @property({ type: Boolean })
  noPoll = false;

  @state()
  private exclusionsRx: RegExp[] = [];

  @state()
  private pageOffset = 0;

  @state()
  private pageSize = 50;

  private get isLoading() {
    return this.queueTask.status === TaskStatus.PENDING;
  }

  private get queue() {
    return this.queueTask.value;
  }

  private readonly queueTask = new Task(this, {
    task: async ([crawlId, regex, pageSize, pageOffset], { signal }) => {
      if (!crawlId) return;

      this.stopPoll();

      try {
        return this.getQueue({ crawlId, regex, pageSize, pageOffset }, signal);
      } catch (err) {
        if (
          isApiError(err) &&
          (err.message === "invalid_regex" ||
            err.message === "crawl_not_running")
        ) {
          // TODO Handle error
          console.error(err);
        }

        this.notify.toast({
          message: msg("Sorry, couldn't fetch page queue at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "crawl-queue-status",
        });
      }
    },
    args: () =>
      [this.crawlId, this.regex, this.pageSize, this.pageOffset] as const,
  });

  private readonly pollTask = new Task(this, {
    task: async ([queue, noPoll]) => {
      if (!queue) return;

      this.stopPoll();

      if (noPoll) {
        console.debug("poll prevented");
        return;
      }

      return window.setTimeout(() => {
        void this.queueTask.run();
      }, POLL_INTERVAL_SECONDS * 1000);
    },
    args: () => [this.queueTask.value, this.noPoll] as const,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.get("noPoll") && !this.noPoll) {
      // Restart poll
      void this.queueTask.run();
    }
  }

  disconnectedCallback() {
    this.stopPoll();
    super.disconnectedCallback();
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("exclusions")) {
      this.exclusionsRx = this.exclusions.map((x) => new RegExp(x));
    }
  }

  private stopPoll() {
    window.clearTimeout(this.pollTask.value);
  }

  render() {
    return html`
      <btrix-section-heading
        part="heading"
        class="[--margin:--sl-spacing-small]"
      >
        ${this.renderOffsetControl()} ${this.renderBadge()}
      </btrix-section-heading>
      ${this.renderContent()}
    `;
  }

  private renderOffsetControl() {
    if (!this.queue) {
      return msg("Queued URLs");
    }
    if (this.pageOffset === 0 && this.queue.total <= this.pageSize) {
      return msg(
        str`Queued URLs from 1 to ${this.localize.number(this.queue.total)}`,
      );
    }

    const offsetValue = this.pageOffset + 1;
    const countMax = Math.min(
      this.pageOffset + this.pageSize,
      this.queue.total,
    );
    const getInputWidth = (v: number | string) =>
      `${Math.max(v.toString().length, 3) + 2}ch`;

    const fromInput = html` <btrix-inline-input
      class="mx-1 inline-block"
      style="width: ${Math.max(offsetValue.toString().length, 2) + 2}ch"
      value="1"
      inputmode="numeric"
      size="small"
      autocomplete="off"
      @sl-input=${(e: SlInputEvent) => {
        const input = e.target as SlInput;

        input.style.width = getInputWidth(input.value);
      }}
      @sl-change=${async (e: SlChangeEvent) => {
        const input = e.target as SlInput;
        const int = +input.value.replace(/\D/g, "");

        await this.updateComplete;

        const value = Math.max(1, Math.min(int, this.queue!.total - 1));

        input.value = value.toString();
        this.pageOffset = value - 1;
      }}
    ></btrix-inline-input>`;

    const max = this.localize.number(countMax);
    const total = this.localize.number(this.queue.total);

    return html`
      <div class="flex items-center text-neutral-500">
        ${msg(html`Queued URLs from ${fromInput} to ${max} of ${total}`, {
          id: "h077c8fe82a78c616",
        })}
      </div>
    `;
  }

  private renderContent() {
    if (!this.queue?.total) {
      if (this.isLoading) {
        return html`
          <div class="flex items-center justify-center text-3xl">
            <sl-spinner></sl-spinner>
          </div>
        `;
      }

      return html`
        <p class="text-sm text-neutral-400">
          ${this.starting ? msg("Crawl starting...") : msg("No pages queued.")}
        </p>
      `;
    }

    return html`
      <btrix-url-list
        class=${clsx(
          tw`part-[row-match]:[--btrix-row-bg-color:--sl-color-danger-100] part-[row-match]:[--btrix-row-hover-bg-color:--sl-color-danger-200] part-[row-match]:[--btrix-row-hover-border-color:--sl-color-danger-300]`,
          tw`part-[order-match]:text-danger part-[order-exclude]:opacity-60`,
          tw`part-[url-exclude]:line-through part-[url-exclude]:opacity-60`,
        )}
        .urls=${this.queue.results}
        offset=${this.pageOffset + 1}
        .includeUrl=${this.isIncluded}
        .excludeUrl=${this.isExcluded}
        aria-live="polite"
        size="small"
        ordered
        border
        highlight
      ></btrix-url-list>

      <footer class="text-center">
        ${when(
          this.queue.total <= this.pageOffset + this.pageSize,
          () =>
            html`<div class="py-3 text-xs text-neutral-400">
              ${msg("End of queue")}
            </div>`,
          () => html`
            <btrix-observable @btrix-intersect=${this.onLoadMoreIntersect}>
              <div class="py-3">
                <sl-icon-button
                  name="three-dots"
                  @click=${this.loadMore}
                  label=${msg("Load more")}
                ></sl-icon-button>
              </div>
            </btrix-observable>
          `,
        )}
      </footer>
    `;
  }

  private renderBadge() {
    if (!this.queue) return "";

    return html`
      ${this.matchedTotal
        ? html`
            <btrix-badge variant="danger" class="ml-1">
              ${this.matchedTotal > 1
                ? msg(str`-${this.localize.number(this.matchedTotal)} URLs`)
                : msg(str`-1 URL`)}
            </btrix-badge>
          `
        : ""}
    `;
  }

  private readonly onLoadMoreIntersect = throttle(50)((e: IntersectEvent) => {
    if (!e.detail.entries[0].isIntersecting) return;
    this.loadMore();
  }) as (e: CustomEvent) => void;

  private loadMore() {
    this.pageSize = this.pageSize + 50;
  }

  private readonly isIncluded = (url: string) => {
    return this.queue?.matched.some((v) => v === url) || false;
  };

  private readonly isExcluded = (url: string) => {
    for (const rx of this.exclusionsRx) {
      if (rx.test(url)) {
        return true;
      }
    }

    return false;
  };

  private async getQueue(
    {
      crawlId,
      regex,
      pageSize,
      pageOffset,
    }: {
      crawlId: string;
      regex: CrawlQueue["regex"];
      pageSize: CrawlQueue["pageSize"];
      pageOffset: CrawlQueue["pageOffset"];
    },
    signal: AbortSignal,
  ): Promise<ResponseData> {
    const count = pageSize.toString();
    const params = new URLSearchParams({
      offset: pageOffset.toString(),
      count,
      regex,
    });
    const data: ResponseData = await this.api.fetch(
      `/orgs/${this.orgId}/crawls/${crawlId}/queue?${params.toString()}`,
      { signal },
    );

    return data;
  }
}
