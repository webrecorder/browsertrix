import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlInput, SlSelectEvent } from "@shoelace-style/shoelace";
import clsx from "clsx";
import Fuse from "fuse.js";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import queryString from "query-string";

import { CollectionThumbnail } from "./collection-thumbnail";

import { BtrixElement } from "@/classes/BtrixElement";
import { defaultFuseOptions } from "@/context/search-org/connectFuse";
import {
  collectionRwpContext,
  type CollectionRwpContext,
} from "@/pages/org/collection-detail/context/collection-rwp";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { PageUrlCount } from "@/types/page";
import type { UnderlyingFunction } from "@/types/utils";
import { stopProp } from "@/utils/events";
import { formatRwpTimestamp } from "@/utils/replay";
import { tw } from "@/utils/tailwind";

const SEARCH_LIMIT = 3;

/**
 * @fires btrix-collection-saved
 */
@customElement("btrix-select-collection-thumbnail")
@localized()
export class SelectCollectionThumbnail extends BtrixElement {
  @consume({ context: collectionRwpContext, subscribe: true })
  private readonly rwp?: CollectionRwpContext;

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  homeUrl?: string;

  @property({ type: String })
  homeUrlTs?: string;

  @property({ type: String })
  thumbnailName?: string;

  @property({ type: String })
  thumbnailPath?: string;

  @state()
  private open = false;

  @state()
  private searchValue = "";

  @query("sl-input")
  private readonly input?: SlInput | null;

  readonly #screenshots = new Map<
    string,
    {
      blob: Promise<Blob | undefined>;
      url: Promise<string | undefined>;
    }
  >();

  readonly #fuse = new Fuse<PageUrlCount>([], {
    ...defaultFuseOptions,
    keys: ["url"],
  });

  /**
   * Get page URLs included in collection and add them to fuzzy search collection.
   */
  private readonly urlCountsTask = new Task(this, {
    task: async ([id], { signal }) => {
      if (!id) return;

      const { items } = await this.getUrlCounts({ id }, signal);

      this.#fuse.setCollection(items);

      return items;
    },
    args: () => [this.collectionId] as const,
  });

  /**
   * Make page-based thumbnail options from page URLs in collection, filtered by search string.
   */
  private readonly optionsTask = new Task(this, {
    task: async ([items, searchValue]) => {
      if (!items) return;

      let options = items.slice(0, SEARCH_LIMIT);

      if (searchValue) {
        options = this.#fuse
          .search(this.searchValue, { limit: SEARCH_LIMIT })
          .map(({ item }) => item);
      }

      return options.map((opt) => {
        const timestamp = opt.snapshots[opt.snapshots.length - 1]?.ts || "";
        const id = `${opt.url}-${timestamp}`;

        return {
          id,
          url: opt.url,
          timestamp,
        };
      });
    },
    args: () => [this.urlCountsTask.value, this.searchValue] as const,
  });

  /**
   * Get page screenshots for page-based thumbail options.
   * Depends on `this.rwp` context.
   */
  private readonly screenshotsTask = new Task(this, {
    task: async ([options, rwp], { signal }) => {
      if (!options || !rwp) return this.#screenshots;

      options.forEach(({ id, timestamp, url }) => {
        let thumbnail = this.#screenshots.get(id);

        if (!thumbnail) {
          const blob = this.getBlob({ url: url, timestamp: timestamp }, signal);

          thumbnail = {
            blob,
            url: blob.then((v) => (v ? URL.createObjectURL(v) : undefined)),
          };

          // - Cache blob to use as upload payload
          // - Cache object URL to revoke in component teardown
          this.#screenshots.set(id, thumbnail);
        }
      });

      return this.#screenshots;
    },
    args: () => [this.optionsTask.value, this.rwp] as const,
  });

  disconnectedCallback(): void {
    for (const screenshot of this.#screenshots.values()) {
      void screenshot.url.then((url) =>
        url ? URL.revokeObjectURL(url) : null,
      );
    }
  }

  render() {
    const isCrawler = this.appState.isCrawler;

    return html`<sl-dropdown
      placement="bottom-start"
      distance="8"
      skidding="-4"
      hoist
      ?open=${this.open}
      ?disabled=${!isCrawler}
      stay-open-on-select
      @sl-show=${() => (this.open = true)}
      @sl-hide=${() => (this.open = false)}
    >
      <div
        slot="trigger"
        class=${clsx(
          tw`relative`,
          isCrawler && [
            tw`cursor-pointer rounded-lg transition-all duration-x-fast hover:ring-1 hover:ring-offset-2`,
            this.open && tw`ring-1 ring-offset-2`,
          ],
        )}
      >
        <div class="relative aspect-video">
          <btrix-collection-thumbnail
            src=${ifDefined(
              Object.entries(CollectionThumbnail.Variants).find(
                ([name]) => name === this.thumbnailName,
              )?.[1].path || this.thumbnailPath,
            )}
          ></btrix-collection-thumbnail>

          ${when(
            isCrawler,
            () => html`
              <btrix-button
                class="absolute bottom-2 right-2"
                size="small"
                label=${this.open ? msg("Confirm Edit") : msg("Edit Thumbnail")}
                role="presentation"
                raised
              >
                <sl-icon name="pencil"></sl-icon>
              </btrix-button>
            `,
          )}
        </div>
      </div>
      <sl-menu
        id="thumb-listbox"
        class="pt-0 [scrollbar-gutter:stable]"
        @sl-select=${(e: SlSelectEvent) => {
          console.log("select", e.detail.item.value);
        }}
      >
        <sl-menu-label class="part-[base]:px-3">
          <div
            id="thumb-list-label"
            class="leading-[var(--sl-input-height-small)]"
          >
            ${msg("Page Screenshot")}
          </div>
        </sl-menu-label>
        <div class="px-3 pb-1">${this.renderSearch()}</div>
        <sl-divider></sl-divider>
        <div
          class="contents"
          id="thumb-listbox"
          role="listbox"
          aria-labelledby="thumb-list-label"
        >
          ${this.renderPages()}
        </div>
        <sl-divider></sl-divider>
        <sl-menu-label class="part-[base]:px-3">
          ${msg("Default Thumbnails")}
        </sl-menu-label>
        ${Object.entries(CollectionThumbnail.Variants).map(([name, variant]) =>
          this.renderDefaultOption({
            selected: this.thumbnailName === name,
            ...variant,
          }),
        )}
      </sl-menu>
    </sl-dropdown>`;
  }

  private renderSearch() {
    return html`<sl-input
      class="part-[form-control-label]:sr-only"
      id="thumb-search"
      label=${msg("Page URL")}
      placeholder=${msg("Enter page URL")}
      size="small"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="true"
      aria-controls="thumb-listbox"
      @sl-input=${this.onSearchInput as UnderlyingFunction<
        typeof this.onSearchInput
      >}
    >
      ${this.urlCountsTask.render({
        pending: () => html`<sl-spinner slot="prefix"></sl-spinner>`,
        complete: () => html`<sl-icon slot="prefix" name="search"></sl-icon>`,
      })}
    </sl-input>`;
  }

  private readonly renderPageOption = ({
    id,
    url,
    timestamp,
  }: {
    id: string;
    url: string;
    timestamp: string;
  }) => {
    const selected = url === "TODO";
    const thumbnail = (path?: string) =>
      path
        ? html`<div slot="prefix" class="w-28">
            <btrix-popover
              class="[--sl-tooltip-padding:0] part-[base__arrow]:hidden"
              trigger="hover"
              placement="bottom-start"
              @sl-show=${stopProp}
              @sl-after-show=${stopProp}
              @sl-hide=${stopProp}
              @sl-after-hide=${stopProp}
              hoist
            >
              <div slot="content">
                <btrix-collection-thumbnail
                  src=${path}
                ></btrix-collection-thumbnail>
              </div>

              <div class="relative">
                <btrix-collection-thumbnail
                  src=${path}
                ></btrix-collection-thumbnail>

                <btrix-button
                  class="absolute bottom-2 right-2"
                  size="x-small"
                  role="presentation"
                  raised
                >
                  <sl-icon
                    name="zoom-in"
                    class="size-3"
                    label=${msg("Zoom In")}
                  ></sl-icon>
                </btrix-button>
              </div>
            </btrix-popover>
          </div>`
        : html`<div
            slot="prefix"
            class="flex aspect-video w-28 flex-col items-center justify-center gap-0.5 rounded-lg bg-neutral-100 p-2 text-center text-xs text-neutral-500"
          >
            <sl-icon name="file-earmark-x" class="text-base"></sl-icon>
            ${msg("No thumbnail")}
          </div>`;
    const asyncScreenshotUrl = this.screenshotsTask.value?.get(id)?.url;

    return html`<sl-menu-item
      class=${clsx(
        tw`part-[label]:w-72 part-[base]:items-center`,
        selected && tw`part-[checked-icon]:visible`,
      )}
      aria-selected="${selected}"
      value=${id}
      ?disabled=${until(
        asyncScreenshotUrl?.then((path) => !path),
        true,
      )}
    >
      ${until(
        asyncScreenshotUrl?.then(thumbnail),
        html`<sl-skeleton
          slot="prefix"
          class="aspect-video w-28 part-[base]:rounded-lg"
          effect="sheen"
        ></sl-skeleton>`,
      )}
      ${when(
        url === this.homeUrl && timestamp === this.homeUrlTs,
        () => html`<btrix-badge>${msg("Homepage")}</btrix-badge>`,
      )}
      <div>
        <btrix-code language="url" value=${url} noWrap truncate></btrix-code>
      </div>
      ${when(
        timestamp,
        (ts) => html`
          <div
            class="font-monostyle mt-1 text-xs leading-none text-neutral-500"
          >
            ${this.localize.date(ts)}
          </div>
        `,
      )}
    </sl-menu-item>`;
  };

  private readonly renderDefaultOption = ({
    selected,
    path,
    label,
  }: {
    selected?: boolean;
    path: string;
    label: string;
  }) =>
    html`<sl-menu-item
      class=${clsx(
        tw`part-[label]:w-72 part-[base]:items-center`,
        selected && tw`part-[checked-icon]:visible`,
      )}
      aria-selected="${selected === true}"
      value=${ifDefined(path)}
    >
      <btrix-collection-thumbnail
        slot="prefix"
        class="w-28"
        src=${path}
      ></btrix-collection-thumbnail>
      ${msg("Browsertrix")} ${label}
    </sl-menu-item>`;

  private renderPages() {
    const list = (
      options?: { id: string; url: string; timestamp: string }[],
    ) => {
      if (!options?.length) {
        return html`<div class="p-3 text-neutral-500">
          ${this.searchValue
            ? msg("No matching pages found.")
            : msg("No pages found.")}
        </div>`;
      }

      return repeat(options, ({ id }) => id, this.renderPageOption);
    };

    return this.optionsTask.render({
      complete: list,
      pending: () => list(this.optionsTask.value),
    });
  }

  private readonly onSearchInput = debounce(200)(() => {
    this.searchValue = this.input?.value || "";
  });

  private async getUrlCounts(
    { id, ...params }: { id: string } & APIPaginationQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify({ ...params });

    return this.api.fetch<APIPaginatedList<PageUrlCount>>(
      `/orgs/${this.orgId}/collections/${id}/pageUrlCounts?${query}`,
      { signal },
    );
  }

  private readonly getBlob = async (
    { url, timestamp }: { url: string; timestamp: string },
    signal: AbortSignal,
  ) => {
    if (!this.rwp) {
      console.debug("no this.rwp");
      return;
    }
    const resp = await this.rwp.shadowRoot
      ?.querySelector("iframe")
      ?.contentWindow?.fetch(
        `/replay/w/${this.collectionId}/${formatRwpTimestamp(timestamp)}id_/urn:thumbnail:${url}`,
        { signal },
      );

    if (resp?.status === 200) {
      return await resp.blob();
    }
  };

  private async updateThumbnail({
    id,
    url,
    timestamp,
  }: {
    id: string;
    url: string;
    timestamp: string;
  }) {
    const screenshot = this.#screenshots.get(id);

    if (!screenshot) {
      console.debug("no screenshot");
      return;
    }

    const blob = await screenshot.blob;

    if (!blob) {
      console.debug("no blob");
      return;
    }

    // TODO get filename from rwp?
    const fileName = `page-thumbnail_${id}.jpeg`;

    try {
      const file = new File([blob], fileName, {
        type: blob.type,
      });

      const searchParams = new URLSearchParams({
        filename: fileName,
        sourceUrl: url,
        sourceTs: timestamp,
        // sourcePageId: this.selectedSnapshot.pageId,
      });
      const tasks = [
        this.api.upload(
          `/orgs/${this.orgId}/collections/${this.collectionId}/thumbnail?${searchParams.toString()}`,
          file,
        ),
        // this.updateThumbnail({ defaultThumbnailName: null }),
      ];
      await Promise.all(tasks);

      this.dispatchEvent(new CustomEvent("btrix-collection-saved"));
    } catch (err) {
      console.debug("err");
    }
  }
}
