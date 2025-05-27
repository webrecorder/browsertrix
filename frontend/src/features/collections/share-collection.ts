import { localized, msg, str } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { collectionShareLink } from "./helpers/share-link";

import { BtrixElement } from "@/classes/BtrixElement";
import { ClipboardController } from "@/controllers/clipboard";
import { AnalyticsTrackEvent } from "@/trackEvents";
import {
  CollectionAccess,
  type Collection,
  type PublicCollection,
} from "@/types/collection";
import { track } from "@/utils/analytics";

/**
 * @fires btrix-change
 */
@localized()
@customElement("btrix-share-collection")
export class ShareCollection extends BtrixElement {
  @property({ type: String })
  orgSlug = "";

  @property({ type: String })
  collectionId = "";

  @property({ type: Object })
  collection?: Collection | PublicCollection;

  @property({ type: String })
  context: "private" | "public" = "public";

  @state()
  private showDialog = false;

  private readonly clipboardController = new ClipboardController(this);

  private get shareLink() {
    return collectionShareLink(
      this.collection,
      this.orgSlugState,
      this.orgSlug,
    );
  }

  private get publicReplaySrc() {
    return new URL(
      `/api/orgs/${this.collection?.oid}/collections/${this.collectionId}/public/replay.json`,
      window.location.href,
    ).href;
  }

  public show() {
    this.showDialog = true;
  }

  render() {
    return html` ${this.renderButton()} ${this.renderDialog()}`;
  }

  private renderButton() {
    if (!this.collection) return;

    if (this.collection.access === CollectionAccess.Private) return;

    return html`
      <div class="flex items-center gap-2">
        <btrix-copy-button
          .getValue=${() => this.shareLink}
          content=${msg("Copy Link")}
          @click=${() => {
            void this.clipboardController.copy(this.shareLink);

            if (
              this.collection &&
              this.collection.access === CollectionAccess.Public
            ) {
              track(AnalyticsTrackEvent.CopyShareCollectionLink, {
                org_slug: this.orgSlug,
                collection_slug: this.collection.slug,
                logged_in: !!this.authState,
              });
            }
          }}
        ></btrix-copy-button>
        <sl-tooltip content=${msg("View Embed Code")}>
          <sl-icon-button
            class="text-base"
            name="code-slash"
            @click=${() => {
              this.showDialog = true;
            }}
          >
          </sl-icon-button>
        </sl-tooltip>
        ${when(this.orgSlug && this.collection, (collection) =>
          this.context === "public" && collection.allowPublicDownload
            ? html`
                <sl-tooltip
                  content=${msg("Download Collection: ") +
                  this.localize.bytes(collection.totalSize || 0)}
                >
                  <sl-icon-button
                    class="text-base"
                    name="cloud-download"
                    href=${`/api/public/orgs/${this.orgSlug}/collections/${collection.slug}/download`}
                    download="true"
                    ?disabled=${!this.collection?.totalSize}
                    @click=${() => {
                      track(AnalyticsTrackEvent.DownloadPublicCollection, {
                        org_slug: this.orgSlug,
                        collection_slug: this.collection?.slug,
                      });
                    }}
                  >
                  </sl-icon-button>
                </sl-tooltip>
              `
            : nothing,
        )}
      </div>
    `;
  }

  private renderDialog() {
    return html`
      <btrix-dialog
        .label=${msg(str`Share “${this.collection?.name}”`)}
        .open=${this.showDialog}
        @sl-hide=${() => {
          this.showDialog = false;
        }}
        class="[--width:40rem] [--body-spacing:0]"
      >
        <div class="p-4">
          ${this.renderShareLink()}
          <hr class="my-4" />
          ${this.renderEmbedCode()}
        </div>

        <div slot="footer">
          <sl-button size="small" @click=${() => (this.showDialog = false)}>
            ${msg("Done")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private readonly renderShareLink = () => {
    return html`
      <div class="text-left">
        <div class="form-label">${msg("Link to Share")}</div>
        <btrix-copy-field
          class="mb-3"
          .value="${this.shareLink}"
          hideContentFromScreenReaders
          hoist
        >
          <sl-tooltip slot="prefix" content=${msg("Open in New Tab")} hoist>
            <sl-icon-button
              href=${this.shareLink}
              name="box-arrow-up-right"
              target="_blank"
              class="m-px"
            >
            </sl-icon-button>
          </sl-tooltip>
        </btrix-copy-field>
      </div>
    `;
  };

  private readonly renderEmbedCode = () => {
    const replaySrc = this.publicReplaySrc;
    const embedCode = `<replay-web-page source="${replaySrc}"></replay-web-page>`;
    const importCode = `importScripts("https://replayweb.page/sw.js");`;

    return html`
      ${when(
        this.collection?.access === CollectionAccess.Private,
        () => html`
          <btrix-alert variant="warning" class="mb-3">
            ${msg("Change the visibility setting to embed this collection.")}
          </btrix-alert>
        `,
      )}
      <p class="mb-3">
        ${msg(
          html`To embed this collection into an existing webpage, add the
          following embed code:`,
        )}
      </p>
      <div class="relative mb-5 rounded border bg-slate-50 p-3 pr-9">
        <btrix-code value=${embedCode}></btrix-code>
        <div class="absolute right-1 top-1">
          <btrix-copy-button
            .getValue=${() => embedCode}
            content=${msg("Copy Embed Code")}
            hoist
            raised
          ></btrix-copy-button>
        </div>
      </div>
      <p class="mb-3">
        ${msg(
          html`Add the following JavaScript to your
            <code class="text-[0.9em]">/replay/sw.js</code>:`,
        )}
      </p>
      <div class="relative mb-5 rounded border bg-slate-50 p-3 pr-9">
        <btrix-code language="javascript" value=${importCode}></btrix-code>
        <div class="absolute right-1 top-1">
          <btrix-copy-button
            .getValue=${() => importCode}
            content=${msg("Copy JS")}
            hoist
            raised
          ></btrix-copy-button>
        </div>
      </div>
      <p>
        ${msg(
          html`See
            <a
              class="text-primary"
              href="https://replayweb.page/docs/embedding"
              target="_blank"
            >
              our embedding guide</a
            >
            for more details.`,
        )}
      </p>
    `;
  };
}
