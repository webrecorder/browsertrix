import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { guard } from "lit/directives/guard.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Collection } from "../../types/collection";
import type { IntersectEvent } from "../../components/observable";

const DESCRIPTION_MAX_HEIGHT_PX = 200;

const POLL_INTERVAL_SECONDS = 10;

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
  private openDialogName?: "delete";

  @state()
  private isDialogVisible: boolean = false;

  @state()
  private isDescriptionExpanded = false;

  @state()
  private showPublishedInfo = false;

  @state()
  private isLoading = false;

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId")) {
      this.collection = undefined;
      this.fetchCollection();
    }
  }

  protected async updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("collection") && this.collection) {
      this.checkTruncateDescription();
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
        ${when(this.isLoading, () => html`
          <div class="flex items-center justify-center mr-2 p-2">
            <div class="mr-1">${msg(str`Publishing in progress`)}</div>
            <sl-spinner></sl-spinner>
          </div>
        `)}
        <div>
          ${when(this.collection?.publishedUrl, () => html`
            <sl-button size="small" class="p-2 mb-2"
            @click=${() => this.showPublishedInfo = true}
            >
            <sl-icon name="code-slash"></sl-icon>
            View Embed Code
            </sl-button>
          `)}
          ${when(this.isCrawler, this.renderActions)}
        </div>
      </header>
      <div class="my-7">${this.renderDescription()}</div>
      ${when(
        this.collection?.resources.length,
        () => html`<div>${this.renderReplay()}</div>`
      )}

      <btrix-dialog
        label=${msg("Delete Collection?")}
        ?open=${this.openDialogName === "delete"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          html`Are you sure you want to delete
            <strong>${this.collection?.name}</strong>?`
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
            ?disabled=${!this.isLoading}
            @click=${async () => {
              await this.deleteCollection();
              this.openDialogName = undefined;
            }}
            >Delete Collection</sl-button
          >
        </div>
      </btrix-dialog>
      ${when(this.showPublishedInfo, this.renderPublishedInfo)}
      `;
  }

  private renderPublishedInfo = () => {
    if (!this.collection?.publishedUrl) {
      return;
    }

    const fullUrl = new URL(this.collection?.publishedUrl, window.location.href).href;

    return html`
  <sl-dialog
     label=${msg(str`${this.collection?.name} Embedding Info`)}
     ?open=${this.showPublishedInfo}
     @sl-request-close=${() => (this.showPublishedInfo = false)}
  >
      <p class="text-left">
        Embed this published collection in other site using the following embed code and ReplayWeb.page:
        <p class="py-4"><code class="bg-slate-100 py-0 my-8">
        &lt;replay-web-page src="${fullUrl}"&gt;&lt;/replay-web-page&gt;
        </code></p>
        <p class="py-4">Add the following to ./replay/sw.js</p>
        <p><code class="bg-slate-100 py-0 my-8">
        importScripts("https://replayweb.page/sw.js");
        </code></p>
        <p>See <a class="text-primary" href="https://replayweb.page/docs/embedding"> our embedding guide for more details.</a></p>
      </p>
  </sl-dialog>`
  };

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
      <sl-dropdown distance="4">
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          ${!this.collection?.publishedUrl ? html`
            <sl-menu-item
            style="--sl-color-neutral-700: var(--success)"
            ?disabled=${this.isLoading}
            @click=${this.onPublish}
            >
              <sl-icon name="journal-plus" slot="prefix"></sl-icon>
              ${msg("Publish Collection")}
            </sl-menu-item>
            
            ` : html`
            <sl-menu-item
              style="--sl-color-neutral-700: var(--success)"
            >
            <sl-icon name="box-arrow-up-left" slot="prefix"></sl-icon>
            <a target="_blank" slot="prefix" href="https://replayweb.page?source=${new URL(this.collection?.publishedUrl || "", window.location.href).href}">
            Go to Public View
            </a>
            </sl-menu-item>
            <sl-menu-item
            style="--sl-color-neutral-700: var(--warning)"
            @click=${this.onUnpublish}
            >
              <sl-icon name="journal-x" slot="prefix"></sl-icon>
              ${msg("Unpublish Collection")}
            </sl-menu-item>
            `}
          <sl-divider></sl-divider>
          <sl-menu-item
          @click=${this.onDownload}
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Collection")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `/orgs/${this.orgId}/collections/edit/${this.collectionId}`
              )}
          >
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Edit Collection")}
          </sl-menu-item>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${this.confirmDelete}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Collection")}
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
            () =>
              html`
                <sl-icon-button
                  class="text-base"
                  name="pencil"
                  href=${`/orgs/${this.orgId}/collections/edit/${this.collectionId}#metadata`}
                  @click=${this.navLink}
                  label=${msg("Edit description")}
                ></sl-icon-button>
              `
          )}
        </header>
        <main>
          ${when(
            this.collection,
            () => html`
              <main class="border rounded-lg">
                ${this.collection?.description
                  ? html`<div
                        class="description max-w-prose overflow-hidden mx-auto py-5 transition-all"
                        style=${`max-height: ${DESCRIPTION_MAX_HEIGHT_PX}px`}
                      >
                        <btrix-markdown-viewer
                          value=${this.collection!.description}
                        ></btrix-markdown-viewer>
                      </div>
                      <div
                        role="button"
                        class="descriptionExpandBtn hidden border-t p-2 text-right text-neutral-500 hover:bg-neutral-50 transition-colors font-medium"
                        @click=${this.toggleTruncateDescription}
                      >
                        <span class="inline-block align-middle mr-1"
                          >${this.isDescriptionExpanded
                            ? msg("Less")
                            : msg("More")}</span
                        >
                        <sl-icon
                          class="inline-block align-middle text-base"
                          name=${this.isDescriptionExpanded
                            ? "chevron-double-up"
                            : "chevron-double-down"}
                        ></sl-icon>
                      </div> `
                  : html`<div class="text-center text-neutral-400 p-5">
                      ${msg("No description added.")}
                    </div>`}
              </main>
            `,
            () => html`<div
              class="border rounded flex items-center justify-center text-3xl"
              style=${`max-height: ${DESCRIPTION_MAX_HEIGHT_PX}px`}
            >
              <sl-spinner></sl-spinner>
            </div>`
          )}
        </main>
      </section>
    `;
  }

  private renderReplay() {
    const replaySource = `/api/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return html`<section>
      <header class="flex items-center justify-between">
        <h3 class="text-lg font-semibold leading-none h-8 min-h-fit mb-1">
          ${msg("Replay")}
        </h3>
      </header>
      <main>
        <div class="aspect-4/3 border rounded-lg overflow-hidden">
          ${guard(
            [replaySource],
            () => html`
              <replay-web-page
                source=${replaySource}
                replayBase="/replay/"
                config="${config}"
                noSandbox="true"
                noCache="true"
              ></replay-web-page>
            `
          )}
        </div>
      </main>
    </section>`;
  }

  private async checkTruncateDescription() {
    await this.updateComplete;
    window.requestAnimationFrame(() => {
      const description = this.querySelector(".description") as HTMLElement;
      if (description?.scrollHeight > description?.clientHeight) {
        this.querySelector(".descriptionExpandBtn")?.classList.remove("hidden");
      }
    });
  }

  private toggleTruncateDescription = () => {
    const description = this.querySelector(".description") as HTMLElement;
    if (!description) {
      console.debug("no .description");
      return;
    }
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
    if (this.isDescriptionExpanded) {
      description.style.maxHeight = `${description.scrollHeight}px`;
    } else {
      description.style.maxHeight = `${DESCRIPTION_MAX_HEIGHT_PX}px`;
      description.closest("section")?.scrollIntoView({
        behavior: "smooth",
      });
    }
  };

  private confirmDelete = () => {
    this.openDialogName = "delete";
  };

  private async deleteCollection(): Promise<void> {
    if (!this.collection) return;

    try {
      const name = this.collection.name;
      await this.apiFetch(
        `/orgs/${this.orgId}/collections/${this.collection.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.navTo(`/orgs/${this.orgId}/collections`);

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
      `/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`,
      this.authState!
    );

    return data;
  }

  private async onDownload() {
    const resp = await fetch(
      `/api/orgs/${this.orgId}/collections/${this.collectionId}/download`,
      {
        headers: {...this.authState!.headers}
      }
    );
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    document.body.appendChild(a);
    a.setAttribute("display", "none");
    a.href = objectUrl;
    a.setAttribute("download", this.collection?.name + ".wacz");
    a.click();
    window.URL.revokeObjectURL(objectUrl);
  }

  private async onPublish() {
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/collections/${this.collectionId}/publish`,
      this.authState!,
      {
        method: "POST",
      }
    );
    this.isLoading = true;
    await this.waitForCollectionPublished();
  }

  private async waitForCollectionPublished() {
    try {
      const data: Collection = await this.apiFetch(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        this.authState!
      );
      if (data.publishedUrl.length > 0) {
        this.isLoading = false;
        this.collection = data;
        return;
      }
    } catch (e: any) {
      this.notify({
        message:
          e.statusCode === 404
            ? msg("Collection not found.")
            : msg("Sorry, couldn't retrieve Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    // Restart timer for next poll
    window.setTimeout(async () => {
      await this.waitForCollectionPublished();
    }, 1000 * POLL_INTERVAL_SECONDS);
  }

  private async onUnpublish() {
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/collections/${this.collectionId}/unpublish`,
      this.authState!,
      {
        method: "POST",
      }
    );
    if (this.collection && data?.published === false) {
      this.collection = {...this.collection, publishedUrl: undefined};
    }
  }
}
customElements.define("btrix-collection-detail", CollectionDetail);
