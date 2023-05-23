import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";

import type { CollectionSubmitEvent } from "../../components/collection-editor";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Collection } from "../../types/collection";

@localized()
export class CollectionEdit extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  collectionId!: string;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private collection?: Collection;

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId")) {
      this.collection = undefined;
      this.fetchCollection();
    }
  }

  render() {
    return html`${this.renderHeader()}
      <h2 class="text-xl font-semibold mb-6">${this.collection?.name}</h2>
      <btrix-collection-editor
        .authState=${this.authState}
        orgId=${this.orgId}
        ?isSubmitting=${this.isSubmitting}
        @on-submit=${this.onSubmit}
      ></btrix-collection-editor>`;
  }

  private renderHeader = () => html`
    <nav class="mb-5">
      <a
        class="text-gray-600 hover:text-gray-800 text-sm font-medium"
        href=${`/orgs/${this.orgId}/collections`}
        @click=${this.navLink}
      >
        <sl-icon name="arrow-left" class="inline-block align-middle"></sl-icon>
        <span class="inline-block align-middle"
          >${msg("Back to Collections")}</span
        >
      </a>
    </nav>
  `;

  private renderLoading = () => html`<div
    class="w-full flex items-center justify-center my-24 text-3xl"
  >
    <sl-spinner></sl-spinner>
  </div>`;

  private async onSubmit(e: CollectionSubmitEvent) {
    this.isSubmitting = true;
    console.log("submit", e.detail.values);

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(e.detail.values),
        }
      );

      this.notify({
        message: msg(
          str`Successfully created "${data.added.name}" Collection.`
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      this.navTo(`/orgs/${this.orgId}/collections`);
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }

      console.log(this.serverError);
    }

    this.isSubmitting = false;
  }

  private async fetchCollection() {
    try {
      this.collection = await this.getCollection();
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCollection(): Promise<Collection> {
    const data: Collection = await this.apiFetch(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      this.authState!
    );

    return data;
  }
}
customElements.define("btrix-collection-edit", CollectionEdit);
