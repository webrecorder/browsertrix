import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { CollectionSubmitEvent } from "./collection-editor";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Collection } from "../../types/collection";
import "./collection-editor";

@localized()
export class CollectionsNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private collection?: Collection;

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  render() {
    return html`${this.renderHeader()}
      <h2 class="text-xl font-semibold mb-6">${msg("New Collection")}</h2>
      <btrix-collection-editor
        .authState=${this.authState}
        orgId=${this.orgId}
        ?isSubmitting=${this.isSubmitting}
        ?isCrawler=${this.isCrawler}
        @on-submit=${this.onSubmit}
      ></btrix-collection-editor>`;
  }

  private renderHeader = () => html`
    <nav class="mb-7">
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

  private async onSubmit(e: CollectionSubmitEvent) {
    this.isSubmitting = true;
    console.log("submit", e.detail.values);

    try {
      const { name, description, crawlIds, isPublic } = e.detail.values;
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/collections`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            description,
            crawlIds,
            public: isPublic === "on",
          }),
        }
      );

      this.notify({
        message: msg(str`Successfully created "${data.name}" Collection.`),
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
}
customElements.define("btrix-collections-new", CollectionsNew);
