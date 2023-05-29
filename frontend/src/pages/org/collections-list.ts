import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { APIPaginatedList } from "../../types/api";
import type { Collection } from "../../types/collection";
import noCollectionsImg from "../../assets/images/no-collections-found.webp";

@localized()
export class CollectionsList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private collections?: APIPaginatedList & {
    items: Collection[];
  };

  @state()
  private fetchErrorStatusCode?: number;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId")) {
      this.collections = undefined;
      this.fetchCollections();
    }
  }

  render() {
    return html`
      <header class="contents">
        <div class="flex justify-between w-full h-8 mb-4">
          <h1 class="text-xl font-semibold">${msg("Collections")}</h1>
          ${when(
            this.isCrawler,
            () => html`
              <sl-button
                href=${`/orgs/${this.orgId}/collections/new`}
                variant="primary"
                size="small"
                @click=${this.navLink}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("Create Collection")}
              </sl-button>
            `
          )}
        </div>
      </header>

      <link rel="preload" as="image" href=${noCollectionsImg} />
      ${when(this.fetchErrorStatusCode, this.renderFetchError, () =>
        this.collections
          ? when(this.collections.total, this.renderList, this.renderEmpty)
          : this.renderLoading()
      )}
    `;
  }

  private renderLoading = () => html`<div
    class="w-full flex items-center justify-center my-24 text-3xl"
  >
    <sl-spinner></sl-spinner>
  </div>`;

  private renderEmpty = () => html`
    <div
      class="grid grid-cols-[max-content] gap-4 justify-center justify-items-center text-center"
    >
      <figure>
        <div class="w-[27rem] max-w-[100vw] aspect-square">
          <img src=${noCollectionsImg} />
        </div>
        <figcaption class="text-lg text-primary font-semibold">
          ${msg("Start building your Collection.")}
        </figcaption>
      </figure>
      ${when(
        this.isCrawler,
        () => html`
          <p class="max-w-[18em]">
            ${msg(
              "Organize your crawls into a Collection to easily replay them together."
            )}
          </p>
          <div>
            <sl-button
              href=${`/orgs/${this.orgId}/collections/new`}
              variant="primary"
              @click=${this.navLink}
            >
              ${msg("Create Collection")}
            </sl-button>
          </div>
        `
      )}
    </div>
  `;

  private renderList = () =>
    this.collections?.items.length
      ? html`
          <header class="p-2 text-neutral-600 leading-none">
            <div
              class="grid grid-cols-1 md:grid-cols-[20rem_1fr_16ch_repeat(2,12ch)_1.5rem] gap-4"
            >
              <div class="col-span-1 text-xs px-2">
                ${msg("Collection Name")}
              </div>
              <div class="col-span-1 text-xs">${msg("Top Tags")}</div>
              <div class="col-span-1 text-xs">${msg("Last Updated")}</div>
              <div class="col-span-1 text-xs">${msg("Total Crawls")}</div>
              <div class="col-span-2 text-xs">${msg("Total Pages")}</div>
            </div>
          </header>
          <ul class="contents">
            ${this.collections.items.map(this.renderItem)}
          </ul>
        `
      : html`TODO`;

  private renderItem = (col: Collection) =>
    html`<li class="mb-2 last:mb-0">
      <a
        href=${`/orgs/${this.orgId}/collections/view/${col.id}`}
        class="block border rounded shadow-sm p-2 leading-none hover:bg-neutral-50"
        @click=${this.navLink}
      >
        <div
          class="grid grid-cols-1 md:grid-cols-[20rem_1fr_16ch_repeat(2,12ch)_1.5rem] gap-4 items-center"
        >
          <div class="col-span-1 truncate px-2 font-semibold">${col.name}</div>
          <div class="col-span-1 truncate">
            ${col.tags
              .slice(0, 5)
              .map(
                (tag) =>
                  html`<btrix-tag class="mr-1" size="small">${tag}</btrix-tag>`
              )}
          </div>
          <div class="col-span-1 text-xs text-neutral-500 font-monostyle">
            <sl-format-date
              date=${`${col.modified}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
          </div>
          <div
            class="col-span-1 truncate text-xs text-neutral-500 font-monostyle"
          >
            ${col.crawlCount === 1
              ? msg("1 crawl")
              : msg(str`${this.numberFormatter.format(col.crawlCount)} crawls`)}
          </div>
          <div
            class="col-span-1 truncate text-xs text-neutral-500 font-monostyle"
          >
            ${col.pageCount === 1
              ? msg("1 page")
              : msg(str`${this.numberFormatter.format(col.pageCount)} pages`)}
          </div>
          <div class="col-span-1 flex items-center justify-center">
            <btrix-button class="dropdownTrigger" label=${msg("Actions")} icon>
              <sl-icon class="font-base" name="three-dots-vertical"></sl-icon>
            </btrix-button>
          </div>
        </div>
      </a>
    </li>`;

  private renderFetchError = () => html`
    <div>
      <btrix-alert variant="danger">
        ${msg(`Something unexpected went wrong while retrieving Collections.`)}
      </btrix-alert>
    </div>
  `;

  private async fetchCollections() {
    this.fetchErrorStatusCode = undefined;

    try {
      this.collections = await this.getCollections();
    } catch (e: any) {
      if (e.isApiError) {
        this.fetchErrorStatusCode = e.statusCode;
      } else {
        this.notify({
          message: msg("Sorry, couldn't retrieve Collections at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async getCollections(): Promise<APIPaginatedList> {
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/collections`,
      this.authState!
    );

    return data;
  }
}
customElements.define("btrix-collections-list", CollectionsList);
