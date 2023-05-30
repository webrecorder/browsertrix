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
  private openDialogName?: "delete";

  @state()
  private isDialogVisible: boolean = false;

  @state()
  private collectionToDelete?: Collection;

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

      <btrix-dialog
        label=${msg("Delete Collection?")}
        ?open=${this.openDialogName === "delete"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          html`Are you sure you want to delete
            <strong>${this.collectionToDelete?.name}</strong>?`
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            @click=${() => (this.openDialogName = undefined)}
            >Cancel</sl-button
          >
          <sl-button
            size="small"
            variant="primary"
            @click=${async () => {
              await this.deleteCollection(this.collectionToDelete!);
              this.openDialogName = undefined;
            }}
            >Delete Collection</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private renderLoading = () => html`<div
    class="w-full flex items-center justify-center my-24 text-3xl"
  >
    <sl-spinner></sl-spinner>
  </div>`;

  private renderEmpty = () => html`
    <div
      class="grid grid-cols-[max-content] gap-3 justify-center justify-items-center text-center"
    >
      <figure>
        <div class="w-[27rem] max-w-[100vw] aspect-square">
          <img src=${noCollectionsImg} />
        </div>
        <figcaption class="text-lg text-primary font-semibold">
          ${this.isCrawler
            ? msg("Start building your Collection.")
            : msg("No Collections Found")}
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
        `,
        () => html`
          <p class="max-w-[18em]">
            ${msg("Your organization doesn't have any Collections, yet.")}
          </p>
        `
      )}
    </div>
  `;

  private renderList = () =>
    this.collections?.items.length
      ? html`
          <header class="py-2 text-neutral-600 leading-none">
            <div
              class="hidden md:grid md:grid-cols-[repeat(2,1fr)_16ch_repeat(2,10ch)_2.5rem] gap-4"
            >
              <div class="col-span-1 text-xs pl-3">
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
        class="block border rounded shadow-sm leading-none hover:bg-neutral-50"
        @click=${(e: MouseEvent) => {
          if (
            (
              (e.currentTarget as HTMLElement)?.querySelector(
                ".actionsCol"
              ) as HTMLElement
            ).contains(e.target as HTMLElement)
          ) {
            e.preventDefault();
          } else {
            this.navLink(e);
          }
        }}
      >
        <div
          class="relative p-3 md:p-0 grid grid-cols-1 md:grid-cols-[repeat(2,1fr)_16ch_repeat(2,10ch)_2.5rem] gap-3 lg:h-10 items-center"
        >
          <div class="col-span-1 md:pl-3 truncate font-semibold">
            ${col.name}
          </div>
          <div class="col-span-1 order-last md:order-none truncate">
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
          <div
            class="actionsCol absolute top-0 right-0 md:relative col-span-1 flex items-center justify-center"
          >
            ${this.isCrawler ? this.renderActions(col) : ""}
          </div>
        </div>
      </a>
    </li>`;

  private renderActions = (col: Collection) => {
    return html`
      <sl-dropdown distance="4">
        <btrix-button class="p-2" slot="trigger" label=${msg("Actions")} icon>
          <sl-icon class="font-base" name="three-dots-vertical"></sl-icon>
        </btrix-button>
        <sl-menu>
          <sl-menu-item
            @click=${() =>
              this.navTo(`/orgs/${this.orgId}/collections/edit/${col.id}`)}
          >
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Edit Collection")}
          </sl-menu-item>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.confirmDelete(col)}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Collection")}
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  };

  private renderFetchError = () => html`
    <div>
      <btrix-alert variant="danger">
        ${msg(`Something unexpected went wrong while retrieving Collections.`)}
      </btrix-alert>
    </div>
  `;

  private confirmDelete = (collection: Collection) => {
    this.collectionToDelete = collection;
    this.openDialogName = "delete";
  };

  private async deleteCollection(collection: Collection): Promise<void> {
    try {
      const name = collection.name;
      await this.apiFetch(
        `/orgs/${this.orgId}/collections/${collection.id}`,
        this.authState!,
        // FIXME API method is GET right now
        {
          method: "DELETE",
        }
      );

      this.collectionToDelete = undefined;
      this.getCollections();

      this.notify({
        message: msg(html`Deleted <strong>${name}</strong> Collection.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

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
