import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import type {
  SlChangeEvent,
  SlSelectEvent,
  SlSwitch,
} from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import {
  CollectionThumbnail,
  DEFAULT_THUMBNAIL_VARIANT,
  Thumbnail,
} from "../collection-thumbnail";
import { type SelectCollectionAccess } from "../select-collection-access";

import { BtrixElement } from "@/classes/BtrixElement";
import { viewStateContext, type ViewStateContext } from "@/context/view-state";
import { RouteNamespace } from "@/routes";
import {
  CollectionAccess,
  type Collection,
  type PublicCollection,
} from "@/types/collection";

@customElement("btrix-collection-share-settings")
@localized()
export class CollectionShareSettings extends BtrixElement {
  @property({ type: Object })
  collection?: Collection;

  @consume({ context: viewStateContext })
  viewState?: ViewStateContext;

  @property({ type: String })
  public access = this.collection?.access;
  @property({ type: Boolean })
  public allowPublicDownload = this.collection?.allowPublicDownload;
  @property({ type: String })
  public defaultThumbnailName?: `${Thumbnail}` | null = this.collection
    ?.defaultThumbnailName as `${Thumbnail}` | null;

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("collection")) {
      this.access = this.collection?.access;
      this.allowPublicDownload = this.collection?.allowPublicDownload;
      this.defaultThumbnailName = this.collection?.defaultThumbnailName as
        | `${Thumbnail}`
        | null;
    }
  }

  private get shareLink() {
    const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
    if (this.collection) {
      return `${baseUrl}/${
        this.collection.access === CollectionAccess.Private
          ? `${RouteNamespace.PrivateOrgs}/${this.orgSlugState}/collections/view/${this.collection.id}`
          : `${RouteNamespace.PublicOrgs}/${this.viewState?.params.slug || ""}/collections/${this.collection.slug}`
      }`;
    }
    return "";
  }

  private get publicReplaySrc() {
    if (!this.collection) return;
    return new URL(
      `/api/orgs/${this.collection.oid}/collections/${this.collection.id}/public/replay.json`,
      window.location.href,
    ).href;
  }
  render() {
    return html`
      <div class="mb-7">
        <btrix-select-collection-access
          value=${ifDefined(this.collection?.access)}
          ?readOnly=${!this.appState.isCrawler}
          @sl-select=${(e: SlSelectEvent) => {
            this.access = (e.target as SelectCollectionAccess).value;
            this.dispatchEvent(
              new CustomEvent("btrix-change", {
                bubbles: true,
              }),
            );
          }}
        ></btrix-select-collection-access>
        ${when(
          this.org &&
            !this.org.enablePublicProfile &&
            this.collection?.access === CollectionAccess.Public,
          () => html`
            <btrix-alert variant="warning" class="mt-3">
              ${msg(
                "The org profile page isn't public yet. To make the org profile and this collection visible to the public, update profile visibility in org settings.",
              )}
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
            content=${msg(
              "Choose a thumbnail to represent this collection in the org dashboard and profile page.",
            )}
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
              this.allowPublicDownload = (e.target as SlSwitch).checked;
            }}
            >${msg("Show download button")}</sl-switch
          >
        </div>
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
  private renderThumbnails() {
    let selectedImgSrc = DEFAULT_THUMBNAIL_VARIANT.path;

    if (this.defaultThumbnailName) {
      const variant = Object.entries(CollectionThumbnail.Variants).find(
        ([name]) => name === this.defaultThumbnailName,
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
              this.defaultThumbnailName = name;
              this.dispatchEvent(
                new CustomEvent("btrix-change", {
                  bubbles: true,
                }),
              );
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
}
