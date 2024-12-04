import { localized, msg, str } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { SelectCollectionAccess } from "./select-collection-access";

import { BtrixElement } from "@/classes/BtrixElement";
import { ClipboardController } from "@/controllers/clipboard";
import { RouteNamespace } from "@/routes";
import { CollectionAccess, type Collection } from "@/types/collection";

export type SelectVisibilityDetail = {
  item: { value: CollectionAccess };
};

/**
 * @fires btrix-select
 */
@localized()
@customElement("btrix-share-collection")
export class ShareCollection extends BtrixElement {
  @property({ type: String })
  collectionId = "";

  @property({ type: Object })
  collection?: Partial<Collection>;

  @state()
  private showDialog = false;

  @state()
  private showEmbedCode = false;

  private readonly clipboardController = new ClipboardController(this);

  private get shareLink() {
    const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
    if (this.collection) {
      return `${baseUrl}/${this.collection.access === CollectionAccess.Private ? `${RouteNamespace.PrivateOrgs}/${this.orgSlug}/collections/view` : `${RouteNamespace.PublicOrgs}/${this.orgSlug}/collections`}/${this.collectionId}`;
    }
    return "";
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
    if (!this.collection) {
      return html`
        <sl-skeleton
          effect="pulse"
          class="h-[var(--sl-input-height-small)] w-20 [--border-radius:var(--sl-input-border-radius-small)]"
        ></sl-skeleton>
      `;
    }

    if (this.collection.access === CollectionAccess.Private) {
      return html`
        <sl-button
          variant=${this.collection.crawlCount ? "primary" : "default"}
          size="small"
          @click=${() => (this.showDialog = true)}
        >
          <sl-icon name="box-arrow-up" slot="prefix"></sl-icon>
          ${msg("Share")}
        </sl-button>
      `;
    }

    return html`
      <sl-button-group>
        <sl-tooltip
          content=${this.clipboardController.isCopied
            ? ClipboardController.text.copied
            : this.collection.access === CollectionAccess.Unlisted
              ? msg("Copy unlisted link")
              : msg("Copy public link")}
        >
          <sl-button
            variant=${this.collection.crawlCount ? "primary" : "default"}
            size="small"
            ?disabled=${!this.shareLink}
            @click=${() => {
              void this.clipboardController.copy(this.shareLink);
            }}
          >
            <sl-icon
              name=${this.clipboardController.isCopied
                ? "check-lg"
                : "link-45deg"}
            >
            </sl-icon>
            ${msg("Copy Link")}
          </sl-button>
        </sl-tooltip>
        <sl-dropdown distance="4" placement="bottom-end">
          <sl-button
            slot="trigger"
            size="small"
            variant=${this.collection.crawlCount ? "primary" : "default"}
            caret
          >
          </sl-button>
          <sl-menu>
            <sl-menu-item
              @click=${() => {
                this.showEmbedCode = true;
                this.showDialog = true;
              }}
            >
              <sl-icon slot="prefix" name="code-slash"></sl-icon>
              ${msg("View Embed Code")}
            </sl-menu-item>
            ${when(
              this.authState &&
                this.collectionId &&
                this.shareLink !==
                  window.location.href.slice(
                    0,
                    window.location.href.indexOf(this.collectionId) +
                      this.collectionId.length,
                  ),
              () => html`
                <btrix-menu-item-link
                  href=${this.shareLink}
                  ?disabled=${!this.shareLink}
                >
                  ${this.collection?.access === CollectionAccess.Unlisted
                    ? html`
                        <sl-icon
                          slot="prefix"
                          name=${SelectCollectionAccess.Options.unlisted.icon}
                        ></sl-icon>
                        ${msg("Visit Unlisted Page")}
                      `
                    : html`
                        <sl-icon
                          slot="prefix"
                          name=${SelectCollectionAccess.Options.public.icon}
                        ></sl-icon>
                        ${msg("Visit Public Page")}
                      `}
                </btrix-menu-item-link>
                <sl-divider></sl-divider>
                <sl-menu-item
                  @click=${() => {
                    this.showDialog = true;
                  }}
                >
                  <sl-icon slot="prefix" name="eye-fill"></sl-icon>
                  ${msg("Change Link Visibility")}
                </sl-menu-item>
              `,
              () => html`
                <btrix-menu-item-link
                  href=${`/api/orgs/${this.collection?.oid}/collections/${this.collectionId}/download`}
                  download
                >
                  <sl-icon name="cloud-download" slot="prefix"></sl-icon>
                  ${msg("Download Collection")}
                </btrix-menu-item-link>
              `,
            )}
          </sl-menu>
        </sl-dropdown>
      </sl-button-group>
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
        @sl-after-hide=${() => {
          this.showEmbedCode = false;
        }}
        style="--width: 32rem;"
      >
        ${when(
          this.authState && this.collection,
          (collection) => html`
            <div class="mb-5">
              <btrix-select-collection-access
                value=${ifDefined(collection.access)}
                ?readOnly=${!this.appState.isCrawler}
                @sl-select=${(e: SlSelectEvent) => {
                  this.dispatchEvent(
                    new CustomEvent<SelectVisibilityDetail>("btrix-select", {
                      detail: {
                        item: {
                          value: (e.target as SelectCollectionAccess).value,
                        },
                      },
                    }),
                  );
                }}
              ></btrix-select-collection-access>
            </div>
          `,
        )}
        ${this.renderShareLink()} ${this.renderEmbedCode()}
        <div slot="footer" class="flex justify-end gap-2">
          <sl-button size="small" @click=${() => (this.showDialog = false)}>
            ${msg("Done")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private readonly renderShareLink = () => {
    return html`
      <btrix-details
        ?open=${!this.showEmbedCode &&
        this.collection &&
        this.collection.access !== CollectionAccess.Private}
      >
        <span slot="title">${msg("Link to Share")}</span>
        <btrix-copy-field
          class="my-3"
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
      </btrix-details>
    `;
  };

  private readonly renderEmbedCode = () => {
    const replaySrc = this.publicReplaySrc;
    const embedCode = `<replay-web-page source="${replaySrc}"></replay-web-page>`;
    const importCode = `importScripts("https://replayweb.page/sw.js");`;

    return html`
      <btrix-details ?open=${this.showEmbedCode}>
        <span slot="title">${msg("Embed Code")}</span>
        ${when(
          this.collection?.access === CollectionAccess.Private,
          () => html`
            <btrix-alert variant="warning" class="my-3">
              ${msg("Change the visibility setting to embed this collection.")}
            </btrix-alert>
          `,
        )}
        <p class="my-3">
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
      </btrix-details>
    `;
  };
}
