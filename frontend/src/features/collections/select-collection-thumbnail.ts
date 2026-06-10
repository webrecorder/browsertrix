import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import type { SlInput, SlSelectEvent } from "@shoelace-style/shoelace";
import clsx from "clsx";
import Fuse from "fuse.js";
import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import orderBy from "lodash/fp/orderBy";
import queryString from "query-string";

import { CollectionThumbnail, type Thumbnail } from "./collection-thumbnail";

import { BtrixElement } from "@/classes/BtrixElement";
import { defaultFuseOptions } from "@/context/search-org/connectFuse";
import {
  collectionRwpContext,
  type CollectionRwpContext,
} from "@/pages/org/collection-detail/context/collection-rwp";
import { getThumbnailBlob } from "@/pages/org/collection-detail/utils/getThumbnailBlob";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { PageUrlCount } from "@/types/page";
import type { UnderlyingFunction } from "@/types/utils";
import { tw } from "@/utils/tailwind";

import "@/features/collections/collection-thumbnail";

const SEARCHABLE_MAX = 1000;
const SEARCH_LIMIT = 3;

type PageSnapshotOption = {
  pageId: string;
  url: string;
  timestamp: string;
};

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

  @property({ type: Number })
  pageCount?: number;

  @state()
  private open = false;

  @state()
  private searchValue = "";

  @state()
  private nextThumbnailUrl?: string;

  @query("sl-input")
  private readonly input?: SlInput | null;

  readonly #screenshots = new Map<
    /* pageId */ string,
    {
      blob: Promise<Blob | undefined>;
      url: Promise<string | undefined>;
    }
  >();

  #fuse?: Fuse<PageUrlCount>;

  /**
   * Get page URLs included in collection and determine whether to use fuzzy search or prefix search
   */
  readonly urlCountsTask = new Task(this, {
    task: async ([id], { signal }) => {
      if (!id) return;

      let { items } = await this.getUrlCounts(
        { id, pageSize: SEARCHABLE_MAX },
        signal,
      );

      // FIXME API doesn't currently return total so length instead
      if (items.length < SEARCHABLE_MAX) {
        // FIXME API doesn't currently support sorting by newest snapshot
        items = orderBy<PageUrlCount>(
          ({ snapshots }) => snapshots[snapshots.length - 1].ts,
        )("desc")(items);

        if (this.#fuse) {
          this.#fuse.setCollection(items);
        } else {
          this.#fuse = new Fuse<PageUrlCount>(items, {
            ...defaultFuseOptions,
            keys: ["url"],
          });
        }
      }

      return items;
    },
    args: () => [this.collectionId] as const,
  });

  /**
   * Make page-based thumbnail options from page URLs in collection, filtered by search string.
   */
  private readonly optionsTask = new Task(this, {
    task: async ([items, searchValue], { signal }) => {
      if (!items) return;

      let options = items.slice(0, SEARCH_LIMIT);

      // Use fuzzy search if available
      if (this.#fuse) {
        if (searchValue) {
          options = this.#fuse
            .search(this.searchValue, { limit: SEARCH_LIMIT })
            .map(({ item }) => item);
        }
      } else {
        // Use API URL prefix search
        if (searchValue) {
          const { items } = await this.getUrlCounts(
            {
              id: this.collectionId ?? "",
              urlPrefix: searchValue,
              pageSize: SEARCH_LIMIT,
            },
            signal,
          );

          options = items;
        }
      }

      return options.map((opt) => {
        const snapshot = opt.snapshots[opt.snapshots.length - 1];

        return {
          pageId: snapshot.pageId,
          url: opt.url,
          timestamp: snapshot.ts,
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

      options.forEach(({ pageId, timestamp, url }) => {
        let thumbnail = this.#screenshots.get(pageId);

        if (!thumbnail) {
          const blob = this.getBlob(
            { collectionId: this.collectionId, rwp: this.rwp, timestamp, url },
            signal,
          );

          thumbnail = {
            blob,
            url: blob.then((v) => (v ? URL.createObjectURL(v) : undefined)),
          };

          // - Cache blob to use as upload payload
          // - Cache object URL to revoke in component teardown
          this.#screenshots.set(pageId, thumbnail);
        }
      });

      return this.#screenshots;
    },
    args: () => [this.optionsTask.value, this.rwp] as const,
  });

  /**
   * Save thumbnail to collection.
   */
  private readonly updateThumbnailTask = new Task(this, {
    autoRun: false,
    task: async ([option], { signal }) => {
      if (!option) return;

      this.open = false;

      try {
        if (typeof option === "string") {
          await this.updateThumbnail({ defaultThumbnailName: option }, signal);
        } else {
          const screenshot = this.#screenshots.get(option.pageId);

          if (!screenshot) {
            throw new Error("no screenshot");
          }

          const url = await screenshot.url;

          if (!url) {
            throw new Error("no screenshot url");
          }

          this.nextThumbnailUrl = url;

          this.notify.toast({
            message: msg("Updating thumbnail..."),
            variant: "info",
            icon: "info-circle",
            id: "collection-thumbnail-update-status",
          });

          await this.uploadThumbnail(option, signal);
          await this.updateThumbnail({ defaultThumbnailName: null }, signal);
        }

        this.notify.toast({
          message: msg("Thumbnail updated."),
          variant: "success",
          icon: "check2-circle",
          id: "collection-thumbnail-update-status",
        });

        this.dispatchEvent(new CustomEvent("btrix-collection-saved"));
      } catch (err) {
        console.debug(err);

        this.notify.toast({
          message: msg("Sorry, couldn't update thumbnail at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "collection-thumbnail-update-status",
        });
      }
    },
    args: () =>
      [undefined] as readonly [PageSnapshotOption | Thumbnail | undefined],
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("thumbnailPath") && this.thumbnailPath) {
      this.nextThumbnailUrl = undefined;
    }
  }

  disconnectedCallback(): void {
    for (const screenshot of this.#screenshots.values()) {
      void screenshot.url.then((url) =>
        url ? URL.revokeObjectURL(url) : null,
      );
    }
  }

  render() {
    const isCrawler = this.appState.isCrawler;
    const updating = this.updateThumbnailTask.status === TaskStatus.PENDING;

    return html`<sl-dropdown
      class="size-full"
      placement="bottom-start"
      distance="8"
      skidding="-3"
      hoist
      ?open=${this.open}
      ?disabled=${!isCrawler}
      stay-open-on-select
      @sl-show=${() => (this.open = true)}
      @sl-hide=${() => (this.open = false)}
      @sl-after-hide=${() => {
        if (this.input) {
          this.input.value = "";
          this.searchValue = "";
        }
      }}
    >
      <div
        slot="trigger"
        class=${clsx(
          tw`relative aspect-video size-full rounded-lg bg-neutral-100`,
          isCrawler && [
            tw`cursor-pointer ring-1 transition-all duration-x-fast hover:ring-offset-2`,
            this.open ? tw`ring-offset-2` : tw`ring-neutral-200`,
          ],
        )}
      >
        <btrix-collection-thumbnail
          class=${clsx(
            updating && tw`opacity-50`,
            tw`transition-opacity duration-fast`,
          )}
          src=${ifDefined(
            this.nextThumbnailUrl ||
              Object.entries(CollectionThumbnail.Variants).find(
                ([name]) => name === this.thumbnailName,
              )?.[1].path ||
              this.thumbnailPath,
          )}
        ></btrix-collection-thumbnail>

        ${when(
          isCrawler,
          () => html`
            <btrix-button
              class="absolute bottom-2 right-2"
              size="small"
              label=${updating
                ? msg("Updating Thumbnail")
                : this.open
                  ? msg("Confirm Edit")
                  : msg("Edit Thumbnail")}
              role="presentation"
              ?loading=${updating}
              raised
            >
              <sl-icon name="pencil"></sl-icon>
            </btrix-button>
          `,
        )}
      </div>
      <sl-menu
        id="thumb-listbox"
        class="pt-0 [scrollbar-gutter:stable]"
        @sl-select=${(e: SlSelectEvent) => {
          const { value } = e.detail.item;

          const defaultThumbnail = Object.entries(
            CollectionThumbnail.Variants,
          ).find(([_name, { path }]) => path === value);

          if (defaultThumbnail) {
            void this.updateThumbnailTask.run([
              defaultThumbnail[0] as Thumbnail,
            ]);
          } else {
            const option = this.optionsTask.value?.find(
              ({ pageId }) => pageId === value,
            );

            if (!option) {
              console.debug("no option");
              return;
            }

            void this.updateThumbnailTask.run([option]);
          }
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
      ${this.optionsTask.render({
        pending: () => html`<sl-spinner slot="prefix"></sl-spinner>`,
        complete: () => html`<sl-icon slot="prefix" name="search"></sl-icon>`,
      })}
    </sl-input>`;
  }

  private readonly renderSnapshotOption = ({
    pageId,
    url,
    timestamp,
  }: PageSnapshotOption) => {
    const selected = url === "TODO";
    const thumbnail = (url?: string) =>
      url
        ? html`<div slot="prefix" class="w-28">
            <btrix-popover
              class="[--sl-tooltip-padding:0] part-[base__arrow]:hidden"
              trigger="hover"
              placement="bottom-start"
              hoist
            >
              <div slot="content">
                <btrix-collection-thumbnail
                  src=${url}
                ></btrix-collection-thumbnail>
              </div>

              <div class="relative">
                <btrix-collection-thumbnail
                  src=${url}
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
    const asyncScreenshotUrl = this.screenshotsTask.value?.get(pageId)?.url;
    const updating = this.updateThumbnailTask.status === TaskStatus.PENDING;

    return html`<sl-menu-item
      class=${clsx(
        tw`part-[label]:w-72 part-[base]:items-center`,
        selected && tw`part-[checked-icon]:visible`,
      )}
      aria-selected="${selected}"
      value=${pageId}
      ?disabled=${until(
        asyncScreenshotUrl?.then((path) => updating || !path),
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
      ?disabled=${this.updateThumbnailTask.status === TaskStatus.PENDING}
      value=${path}
    >
      <btrix-collection-thumbnail
        slot="prefix"
        class="w-28"
        src=${path}
      ></btrix-collection-thumbnail>
      ${msg("Browsertrix")} ${label}
    </sl-menu-item>`;

  private renderPages() {
    const skeleton = () =>
      Array.from({
        length: Math.min(SEARCH_LIMIT, this.pageCount || SEARCH_LIMIT),
      }).map(
        () => html`
          <sl-menu-item class="pointer-events-none" role="presentation">
            <sl-skeleton
              slot="prefix"
              class="aspect-video w-28 part-[base]:rounded-lg"
              effect="sheen"
            ></sl-skeleton>
            <sl-skeleton class="w-20"></sl-skeleton>
          </sl-menu-item>
        `,
      );

    const list = (options?: PageSnapshotOption[]) => {
      if (!options) return skeleton();

      if (!options.length) {
        return html`<div class="p-3 text-neutral-500">
          ${this.searchValue
            ? msg("No matching pages found.")
            : msg("No pages found.")}
        </div>`;
      }

      return repeat(options, ({ pageId }) => pageId, this.renderSnapshotOption);
    };

    return this.optionsTask.render({
      complete: list,
      pending: () => list(this.optionsTask.value),
      initial: skeleton,
    });
  }

  private readonly onSearchInput = debounce(300)(() => {
    const value = this.input?.value.trim();

    if (value) {
      if (this.#fuse || value.startsWith("http")) {
        this.searchValue = value;
      } else {
        this.searchValue = `https://${value}`;

        if (this.input) {
          this.input.value = this.searchValue;
        }
      }
    } else {
      this.searchValue = "";
    }
  });

  private async getUrlCounts(
    { id, ...params }: { id: string; urlPrefix?: string } & APIPaginationQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify({ ...params });

    return this.api.fetch<APIPaginatedList<PageUrlCount>>(
      `/orgs/${this.orgId}/collections/${id}/pageUrlCounts?${query}`,
      { signal },
    );
  }

  private readonly getBlob = getThumbnailBlob;

  private async uploadThumbnail(
    { pageId, url, timestamp }: PageSnapshotOption,
    signal: AbortSignal,
  ) {
    const screenshot = this.#screenshots.get(pageId);

    if (!screenshot) {
      throw new Error("no screenshot");
    }

    const blob = await screenshot.blob;

    if (!blob) {
      throw new Error("no screenshot blob");
    }

    const fileName = `page-thumbnail_${pageId}.jpeg`;
    const file = new File([blob], fileName, {
      type: blob.type,
    });

    const searchParams = new URLSearchParams({
      filename: fileName,
      sourceUrl: url,
      sourceTs: timestamp,
      sourcePageId: pageId,
    });

    return this.api.upload(
      `/orgs/${this.orgId}/collections/${this.collectionId}/thumbnail?${searchParams.toString()}`,
      file,
      signal,
    );
  }

  private async updateThumbnail(
    {
      defaultThumbnailName,
    }: {
      defaultThumbnailName: string | null;
    },
    signal: AbortSignal,
  ) {
    return this.api.fetch<{ updated: boolean }>(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ defaultThumbnailName }),
        signal,
      },
    );
  }
}
