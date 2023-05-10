import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { APIPaginatedList } from "../../types/api";
import noCollectionsImg from "../../assets/images/no-collections-found.webp";

type Collection = any; // TODO

@localized()
export class CollectionsList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  userId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @state()
  private collections?: APIPaginatedList & {
    items: Collection[];
  };

  @state()
  private fetchErrorStatusCode?: number;

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
                href=${`/orgs/${this.orgId}/collections?new`}
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
        <figcaption class="text-lg font-semibold">
          ${msg("No Collections Yet")}
        </figcaption>
      </figure>
      ${when(
        this.isCrawler,
        () => html`
          <p class="max-w-[16em]">
            ${msg(
              "Select and group crawls to create a collection of related content."
            )}
          </p>
          <div>
            <sl-button
              href=${`/orgs/${this.orgId}/collections?new`}
              variant="primary"
              size="small"
              @click=${this.navLink}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${msg("Create Collection")}
            </sl-button>
          </div>
        `
      )}
    </div>
  `;

  private renderList = () => html` TODO `;

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
