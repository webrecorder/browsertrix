import { localized, msg, str } from "@lit/localize";
import type {
  SlChangeEvent,
  SlSelectEvent,
  SlSwitch,
  SlTabGroup,
} from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import {
  CollectionThumbnail,
  DEFAULT_THUMBNAIL_VARIANT,
  Thumbnail,
} from "./collection-thumbnail";
import { SelectCollectionAccess } from "./select-collection-access";

import { BtrixElement } from "@/classes/BtrixElement";
import { ClipboardController } from "@/controllers/clipboard";
import { RouteNamespace } from "@/routes";
import { alerts } from "@/strings/collections/alerts";
import { AnalyticsTrackEvent } from "@/trackEvents";
import {
  CollectionAccess,
  type Collection,
  type PublicCollection,
} from "@/types/collection";
import { track } from "@/utils/analytics";

enum Tab {
  Link = "link",
  Embed = "embed",
}

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
  collection?: Partial<Collection>;

  @state()
  private showDialog = false;

  @query("sl-tab-group")
  private readonly tabGroup?: SlTabGroup | null;

  private readonly clipboardController = new ClipboardController(this);

  private get shareLink() {
    const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
    if (this.collection) {
      return `${baseUrl}/${
        this.collection.access === CollectionAccess.Private
          ? `${RouteNamespace.PrivateOrgs}/${this.orgSlugState}/collections/view/${this.collectionId}`
          : `${RouteNamespace.PublicOrgs}/${this.orgSlug}/collections/${this.collection.slug}`
      }`;
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
            : msg("Copy shareable link")}
        >
          <sl-button
            variant=${this.collection.crawlCount ? "primary" : "default"}
            size="small"
            ?disabled=${!this.shareLink}
            @click=${() => {
              void this.clipboardController.copy(this.shareLink);

              if (this.collection?.access === CollectionAccess.Public) {
                track(AnalyticsTrackEvent.CopyShareCollectionLink, {
                  org_slug: this.orgSlug,
                  collection_slug: this.collection.slug,
                  logged_in: !!this.authState,
                });
              }
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
                this.tabGroup?.show(Tab.Embed);
                this.showDialog = true;
              }}
            >
              <sl-icon slot="prefix" name="code-slash"></sl-icon>
              ${msg("View Embed Code")}
            </sl-menu-item>
            ${when(
              this.authState && !this.navigate.isPublicPage,
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
                ${this.appState.isCrawler
                  ? html`
                      <sl-divider></sl-divider>
                      <sl-menu-item
                        @click=${() => {
                          this.showDialog = true;
                        }}
                      >
                        <sl-icon slot="prefix" name="box-arrow-up"></sl-icon>
                        ${msg("Link Settings")}
                      </sl-menu-item>
                    `
                  : nothing}
              `,
            )}
            ${when(this.orgSlug && this.collection, (collection) =>
              collection.access === CollectionAccess.Public &&
              collection.allowPublicDownload
                ? html`
                    <btrix-menu-item-link
                      href=${`/api/public/orgs/${this.orgSlug}/collections/${this.collectionId}/download`}
                      download
                      ?disabled=${!this.collection?.totalSize}
                      @click=${() => {
                        track(AnalyticsTrackEvent.DownloadPublicCollection, {
                          org_slug: this.orgSlug,
                          collection_slug: this.collection?.slug,
                        });
                      }}
                    >
                      <sl-icon name="cloud-download" slot="prefix"></sl-icon>
                      ${msg("Download Collection")}
                      ${when(
                        this.collection,
                        (collection) => html`
                          <btrix-badge
                            slot="suffix"
                            class="font-monostyle text-xs text-neutral-500"
                            >${this.localize.bytes(
                              collection.totalSize || 0,
                            )}</btrix-badge
                          >
                        `,
                      )}
                    </btrix-menu-item-link>
                  `
                : nothing,
            )}
          </sl-menu>
        </sl-dropdown>
      </sl-button-group>
    `;
  }

  private renderDialog() {
    const showSettings = !this.navigate.isPublicPage && this.authState;

    return html`
      <btrix-dialog
        .label=${msg(str`Share “${this.collection?.name}”`)}
        .open=${this.showDialog}
        @sl-hide=${() => {
          this.showDialog = false;
        }}
        @sl-after-hide=${() => {
          this.tabGroup?.show(Tab.Link);
        }}
        class="[--width:40rem] [--body-spacing:0]"
      >
        <sl-tab-group>
          <sl-tab slot="nav" panel=${Tab.Link}
            >${showSettings ? msg("Link Settings") : msg("Link")}</sl-tab
          >
          <sl-tab slot="nav" panel=${Tab.Embed}>${msg("Embed")}</sl-tab>

          <sl-tab-panel name=${Tab.Link}>
            <div class="px-4 pb-4">
              ${when(
                showSettings && this.collection,
                this.renderSettings,
                this.renderShareLink,
              )}
            </div>
          </sl-tab-panel>

          <sl-tab-panel name=${Tab.Embed}>
            <div class="px-4 pb-4">${this.renderEmbedCode()}</div>
          </sl-tab-panel>
        </sl-tab-group>

        <div slot="footer">
          <sl-button size="small" @click=${() => (this.showDialog = false)}>
            ${msg("Done")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private readonly renderSettings = (collection: Partial<Collection>) => {
    return html`
      <div class="mb-7">
        <btrix-select-collection-access
          value=${ifDefined(collection.access)}
          ?readOnly=${!this.appState.isCrawler}
          @sl-select=${(e: SlSelectEvent) => {
            void this.updateVisibility(
              (e.target as SelectCollectionAccess).value,
            );
          }}
        ></btrix-select-collection-access>
        ${when(
          this.org &&
            !this.org.enablePublicProfile &&
            this.collection?.access === CollectionAccess.Public,
          () => html`
            <btrix-alert variant="warning" class="mt-3">
              ${alerts.orgNotPublicWarning}
            </btrix-alert>
          `,
        )}
      </div>
      ${when(
        this.collection?.access != CollectionAccess.Private,
        () => html`<div class="mb-7">${this.renderShareLink()}</div>`,
      )}
      <div class="mb-7">
        <div class="form-label flex items-center gap-1.5">
          ${msg("Thumbnail")}
          <sl-tooltip
            content=${msg("Choose a thumbnail to represent this collection.")}
          >
            <sl-icon name="info-circle"></sl-icon>
          </sl-tooltip>
        </div>
        ${this.renderThumbnails()}
      </div>
      <div>
        <div class="form-label flex items-center gap-1.5">
          ${msg("Downloads")}
          <sl-tooltip
            content=${msg(
              "If enabled, a button to download this collection will be visible in the shareable page. Please note that even if the download button is disabled, anyone determined to download a shared collection can do so through developer tools. If this is a concern, keep your collection private.",
            )}
          >
            <sl-icon name="info-circle"></sl-icon>
          </sl-tooltip>
        </div>
        <div>
          <sl-switch
            ?checked=${this.collection?.allowPublicDownload}
            @sl-change=${(e: SlChangeEvent) => {
              void this.updateAllowDownload((e.target as SlSwitch).checked);
            }}
            >${msg("Show download button")}</sl-switch
          >
        </div>
      </div>
    `;
  };

  private renderThumbnails() {
    let selectedImgSrc = DEFAULT_THUMBNAIL_VARIANT.path;

    if (this.collection?.defaultThumbnailName) {
      const { defaultThumbnailName } = this.collection;
      const variant = Object.entries(CollectionThumbnail.Variants).find(
        ([name]) => name === defaultThumbnailName,
      );

      if (variant) {
        selectedImgSrc = variant[1].path;
      }
    } else if (this.collection?.thumbnail) {
      selectedImgSrc = this.collection.thumbnail.path;
    }

    const thumbnail = (
      thumbnail: Thumbnail | NonNullable<PublicCollection["thumbnail"]>,
    ) => {
      let name: Thumbnail | null = null;
      let path = "";

      if (Object.values(Thumbnail).some((t) => t === thumbnail)) {
        name = thumbnail as Thumbnail;
        path = CollectionThumbnail.Variants[name].path;
      } else {
        path = (thumbnail as NonNullable<PublicCollection["thumbnail"]>).path;
      }

      if (!path) {
        console.debug("no path for thumbnail:", thumbnail);
        return;
      }

      const isSelected = path === selectedImgSrc;

      return html`
        <sl-tooltip content=${msg("Use thumbnail")}>
          <button
            class="${isSelected
              ? "ring-blue-300 ring-2"
              : "ring-stone-600/10 ring-1"} aspect-video flex-1 overflow-hidden rounded transition-all hover:ring-2 hover:ring-blue-300"
            @click=${() => {
              void this.updateThumbnail({ defaultThumbnailName: name });
            }}
          >
            <div
              class="flex size-full flex-col items-center justify-center bg-cover"
              style="background-image:url('${path}')"
            >
              ${isSelected
                ? html`<sl-icon
                    class="size-10 stroke-black/50 text-white drop-shadow-md [paint-order:stroke]"
                    name="check-lg"
                  ></sl-icon>`
                : nothing}
            </div>
          </button>
        </sl-tooltip>
      `;
    };

    return html`
      <div class="flex gap-3">
        ${when(this.collection?.thumbnail, (t) => thumbnail(t))}
        ${thumbnail(Thumbnail.Cyan)} ${thumbnail(Thumbnail.Green)}
        ${thumbnail(Thumbnail.Yellow)} ${thumbnail(Thumbnail.Orange)}
      </div>
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

  private async updateVisibility(access: CollectionAccess) {
    const prevValue = this.collection?.access;

    // Optimistic update
    if (this.collection) {
      this.collection = { ...this.collection, access };
    }

    try {
      await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ access }),
        },
      );

      this.dispatchEvent(new CustomEvent("btrix-change"));

      this.notify.toast({
        id: "collection-visibility-update-status",
        message: msg("Collection visibility updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (err) {
      console.debug(err);

      // Revert optimistic update
      if (this.collection && prevValue !== undefined) {
        this.collection = { ...this.collection, access: prevValue };
      }

      this.notify.toast({
        id: "collection-visibility-update-status",
        message: msg("Sorry, couldn't update visibility at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async updateThumbnail({
    defaultThumbnailName,
  }: {
    defaultThumbnailName: Thumbnail | null;
  }) {
    const prevValue = this.collection?.defaultThumbnailName;

    // Optimistic update
    if (this.collection) {
      this.collection = { ...this.collection, defaultThumbnailName };
    }

    try {
      await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ defaultThumbnailName }),
        },
      );

      this.dispatchEvent(new CustomEvent("btrix-change"));

      this.notify.toast({
        id: "collection-thumbnail-update-status",
        message: msg("Thumbnail updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (err) {
      console.debug(err);

      // Revert optimistic update
      if (this.collection && prevValue !== undefined) {
        this.collection = {
          ...this.collection,
          defaultThumbnailName: prevValue,
        };
      }

      this.notify.toast({
        id: "collection-thumbnail-update-status",
        message: msg("Sorry, couldn't update thumbnail at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async updateAllowDownload(allowPublicDownload: boolean) {
    const prevValue = this.collection?.allowPublicDownload;

    // Optimistic update
    if (this.collection) {
      this.collection = { ...this.collection, allowPublicDownload };
    }

    try {
      await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ allowPublicDownload }),
        },
      );

      this.dispatchEvent(new CustomEvent("btrix-change"));

      this.notify.toast({
        id: "collection-allow-public-download-update-status",
        message: allowPublicDownload
          ? msg("Download button enabled.")
          : msg("Download button hidden."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (err) {
      console.debug(err);

      // Revert optimistic update
      if (this.collection && prevValue !== undefined) {
        this.collection = {
          ...this.collection,
          allowPublicDownload: prevValue,
        };
      }

      this.notify.toast({
        id: "collection-allow-public-download-update-status",
        message: msg("Sorry, couldn't update download button at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
