import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Collection } from "../../types/collection";

@localized()
export class CollectionDetail extends LiteElement {
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
  private isEditingDescription = false;

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId")) {
      this.collection = undefined;
      this.fetchCollection();
    }
  }

  render() {
    return html`${this.renderHeader()}
      <header class="md:flex justify-between items-end pb-3 border-b">
        <h2
          class="flex-1 min-w-0 text-xl font-semibold leading-10 truncate mr-2"
        >
          ${this.collection?.name || html`<sl-skeleton></sl-skeleton>`}
        </h2>
        ${when(this.isCrawler, this.renderActions)}
      </header>
      <div class="my-7">${this.renderDescription()}</div>
      <div>${this.renderReplay()}</div>`;
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

  private renderActions = () => {
    return html`
      <sl-dropdown placement="bottom-end" distance="4" hoist>
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `/orgs/${this.orgId}/collections/edit/${this.collectionId}`
              )}
          >
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Edit Collection")}
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  };

  private renderDescription() {
    return html`
      <section>
        <header class="flex items-center justify-between">
          <h3 class="text-lg font-semibold leading-none h-8 min-h-fit mb-1">
            ${msg("Description")}
          </h3>
          ${when(
            this.isCrawler,
            () => "" // TODO
            // this.isEditingDescription
            //   ? html`<sl-icon-button
            //       class="text-base"
            //       name="x-lg"
            //       @click=${() => (this.isEditingDescription = false)}
            //       label=${msg("Cancel editing description")}
            //     ></sl-icon-button>`
            //   : html`
            //       <sl-icon-button
            //         class="text-base"
            //         name="pencil"
            //         @click=${() => (this.isEditingDescription = true)}
            //         label=${msg("Edit description")}
            //       ></sl-icon-button>
            //     `
          )}
        </header>
        <main>
          ${when(
            this.isEditingDescription,
            () => html`<btrix-markdown-editor
              initialValue=${this.collection?.description || ""}
              @on-change=${console.log}
            ></btrix-markdown-editor>`,
            () =>
              html`
                <main class="border rounded-lg p-5 max-h-screen overflow-auto">
                  ${this.collection?.description
                    ? html`<div class="max-w-prose mx-auto">
                        <btrix-markdown-viewer
                          value=${this.collection!.description}
                        ></btrix-markdown-viewer>
                      </div>`
                    : html`<div class="text-center text-neutral-400">
                        ${msg("No description added.")}
                      </div>`}
                </main>
              `
          )}
        </main>
      </section>
    `;
  }

  private renderReplay() {
    return html`<section>
      <header class="flex items-center justify-between">
        <h3 class="text-lg font-semibold leading-none h-8 min-h-fit mb-1">
          ${msg("Replay")}
        </h3>
      </header>
      <main class="flex">
        <div class="flex-0 border rounded-lg p-5 mr-3 overflow-auto"></div>
        <div class="flex-1 aspect-4/3 border rounded-lg overflow-hidden">
          replay
        </div>
      </main>
    </section>`;
  }

  private renderLoading = () => html`<div
    class="w-full flex items-center justify-center my-24 text-3xl"
  >
    <sl-spinner></sl-spinner>
  </div>`;

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
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      this.authState!
    );

    console.log(data);

    return data;
  }
}
customElements.define("btrix-collection-detail", CollectionDetail);
