import { localized, msg, str } from "@lit/localize";
import type {
  SlAfterShowEvent,
  SlDetails,
  SlSelectEvent,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { SelectCollectionAccess } from "./select-collection-access";
import { CollectionThumbnail, Thumbnail } from "./thumbnail";

import { BtrixElement } from "@/classes/BtrixElement";
import { ClipboardController } from "@/controllers/clipboard";
import { RouteNamespace } from "@/routes";
import { CollectionAccess, type Collection } from "@/types/collection";
import { tw } from "@/utils/tailwind";

export type SelectVisibilityDetail = {
  item: { value: CollectionAccess };
};

export type SelectThumbnailDetail = {
  fileName: string;
  src: string;
};

/**
 * @fires btrix-select-visibility
 * @fires btrix-select-thumbnail
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

  private get isPrivateView() {
    return (
      this.shareLink !==
      window.location.href.slice(
        0,
        window.location.href.indexOf(this.collectionId) +
          this.collectionId.length,
      )
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
              this.authState && this.collectionId && this.isPrivateView,
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
                  <sl-icon slot="prefix" name="box-arrow-up"></sl-icon>
                  ${msg("Share Settings")}
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
        style="--width: 40rem;"
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
                    new CustomEvent<SelectVisibilityDetail>(
                      "btrix-select-visibility",
                      {
                        detail: {
                          item: {
                            value: (e.target as SelectCollectionAccess).value,
                          },
                        },
                      },
                    ),
                  );
                }}
              ></btrix-select-collection-access>
            </div>
            <div class="mb-7">
              <div class="form-label">${msg("Thumbnail")}</div>
              ${this.renderThumbnails()}
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

  private renderThumbnails() {
    let selectedImgSrc = CollectionThumbnail.Variants[Thumbnail.Cyan].src;

    if (this.collection?.thumbnail?.originalFilename) {
      const { originalFilename } = this.collection.thumbnail;
      const thumbnail = Object.values(CollectionThumbnail.Variants).find(
        ({ fileName }) => fileName === originalFilename,
      );

      if (thumbnail) {
        selectedImgSrc = thumbnail.src;
      }
    }

    const thumbnail = (thumbnail: Thumbnail) => {
      const { fileName, src } = CollectionThumbnail.Variants[thumbnail];

      let content = html``;
      let tooltipContent = msg("Use thumbnail");
      let classNames = "";

      if (src) {
        content = html`
          <div
            class="flex size-full flex-col items-center justify-center bg-cover"
            style="background-image:url('${src}')"
          >
            ${src === selectedImgSrc
              ? html`<sl-icon
                  class="size-10 text-white drop-shadow"
                  name="check-lg"
                ></sl-icon>`
              : nothing}
          </div>
        `;
      } else {
        content = html`<sl-icon class="size-10" name="plus"></sl-icon>`;
        tooltipContent = msg("Choose page thumbnail");
        // Render as select button
        classNames = tw`flex flex-col items-center justify-center bg-neutral-50 text-blue-400 hover:text-blue-500`;
      }

      return html`
        <sl-tooltip content=${tooltipContent || msg("Use thumbnail")}>
          <button
            class=${clsx(
              "flex-1 aspect-video overflow-hidden rounded ring-1 ring-neutral-300 transition-all hover:ring-2 hover:ring-blue-300",
              classNames,
            )}
            @click=${() => {
              if (src) {
                this.dispatchEvent(
                  new CustomEvent<SelectThumbnailDetail>(
                    "btrix-select-thumbnail",
                    {
                      detail: {
                        fileName,
                        src,
                      },
                    },
                  ),
                );
              } else {
                console.log("TODO choose");
              }
            }}
          >
            ${content}
          </button>
        </sl-tooltip>
      `;
    };

    return html`
      <div class="flex gap-3">
        ${thumbnail(Thumbnail.Cyan)} ${thumbnail(Thumbnail.Green)}
        ${thumbnail(Thumbnail.Orange)} ${thumbnail(Thumbnail.Yellow)}
        ${thumbnail(Thumbnail.Custom)}
      </div>
    `;
  }

  private readonly renderShareLink = () => {
    return html`
      <sl-details
        class="mb-3 part-[header]:p-3"
        ?open=${!this.showEmbedCode &&
        this.collection &&
        this.collection.access !== CollectionAccess.Private}
      >
        <span slot="summary">${msg("Link to Share")}</span>
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
      </sl-details>
    `;
  };

  private readonly renderEmbedCode = () => {
    const replaySrc = this.publicReplaySrc;
    const embedCode = `<replay-web-page source="${replaySrc}"></replay-web-page>`;
    const importCode = `importScripts("https://replayweb.page/sw.js");`;

    return html`
      <sl-details
        class="part-[header]:p-3"
        ?open=${this.showEmbedCode}
        @sl-after-show=${async (e: SlAfterShowEvent) => {
          if (this.showEmbedCode) {
            const el = e.currentTarget as SlDetails;

            await this.updateComplete;
            el.scrollIntoView({ behavior: "smooth" });
          }
        }}
      >
        <span slot="summary">${msg("Embed Code")}</span>
        ${when(
          this.collection?.access === CollectionAccess.Private,
          () => html`
            <btrix-alert variant="warning" class="mb-3">
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
      </sl-details>
    `;
  };
}
