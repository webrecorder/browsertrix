import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { SelectCollectionAccess } from "./select-collection-access";
import type { SelectCollectionThumbnail } from "./select-collection-thumbnail";

import { BtrixElement } from "@/classes/BtrixElement";
import type { EditableTextBoxChangeEvent } from "@/components/ui/editable-text-box";
import type {
  EditableTextFieldChangeEvent,
  EditableTextFieldInputEvent,
} from "@/components/ui/editable-text-field";
import { pageTitle } from "@/layouts/pageHeader";
import type { CollectionSavedEvent } from "@/pages/org/collection-detail/types";
import { OrgTab, RouteNamespace } from "@/routes";
import {
  COLLECTION_CAPTION_MAX_LENGTH,
  COLLECTION_NAME_MAX_LENGTH,
  CollectionAccess,
  type Collection,
} from "@/types/collection";
import { richText } from "@/utils/rich-text";
import slugifyStrict from "@/utils/slugify";
import { tw } from "@/utils/tailwind";
import { toShortUrl } from "@/utils/url-helpers";

/**
 * @fires btrix-collection-saved
 */
@customElement("btrix-collection-page-header")
@localized()
export class CollectionPageHeader extends BtrixElement {
  @property({ type: String })
  collectionId = "";

  @property({ type: String })
  collectionName?: string;

  @property({ type: Number })
  collectionSize?: number;

  @property({ type: String })
  slug?: string;

  @property({ type: String })
  caption?: string;

  @property({ type: String })
  access?: CollectionAccess;

  @property({ type: Boolean })
  allowPublicDownload?: boolean;

  @property({ type: String })
  homeUrl?: string;

  @property({ type: String })
  homeUrlTs?: string;

  @property({ type: String })
  thumbnailName?: string;

  @property({ type: String })
  thumbnailPath?: string;

  @property({ type: Number })
  pageCount?: number;

  @property({ type: Boolean })
  loading?: boolean;

  @state()
  private slugPreview = "";

  @query("btrix-select-collection-thumbnail")
  private readonly selectCollectionThumbnail?: SelectCollectionThumbnail | null;

  refresh() {
    // Re-render collection thumbnails since they're dependent items and replay
    void this.selectCollectionThumbnail?.urlCountsTask.run();
  }

  render() {
    const isCrawler = this.appState.isCrawler;
    const showCaption = isCrawler || this.caption;

    return html`<header
      class=${clsx(
        tw`grid items-end gap-5 md:grid-cols-[auto_1fr] md:gap-3 lg:grid-cols-[auto_1fr_auto]`,
        showCaption
          ? tw`md:grid-rows-[auto_1fr] md:items-start`
          : tw`md:items-center`,
      )}
    >
      <div
        class=${clsx(tw`self-start lg:pr-2`, showCaption && tw`md:row-span-2`)}
      >
        <div class="aspect-video md:h-36">
          ${this.loading
            ? html`<sl-skeleton
                class="block aspect-video [--border-radius:var(--sl-border-radius-large)]"
                effect="sheen"
              ></sl-skeleton>`
            : this.renderThumbnail()}
        </div>
      </div>
      <div
        class=${clsx(
          tw`overflow-hidden md:col-start-2 md:row-start-1`,
          isCrawler && tw`-m-1 p-1`,
        )}
      >
        <div
          class=${clsx(
            tw`flex items-center gap-2.5`,
            isCrawler ? tw`mb-1.5` : tw`mb-2`,
          )}
        >
          ${pageTitle(
            when(this.collectionName, this.renderName),
            tw`mb-2 h-6 w-60`,
            tw`grid`,
          )}
        </div>
        <div class="relative z-10">${this.renderAccessDetails()}</div>
      </div>
      ${showCaption
        ? html`<div class="md:col-start-2 md:row-start-2 lg:col-end-4">
            ${isCrawler
              ? this.loading
                ? html`<sl-skeleton class="w-full max-w-prose"></sl-skeleton>`
                : html`<btrix-editable-text-box
                    label=${msg("Collection Summary")}
                    .value=${this.caption ?? ""}
                    placeholder=${msg("Add a summary...")}
                    maxLength=${COLLECTION_CAPTION_MAX_LENGTH}
                    clamp="2"
                    @btrix-change=${(e: EditableTextBoxChangeEvent) => {
                      void this.updateSummary(e.detail.value);
                    }}
                  ></btrix-editable-text-box>`
              : this.caption
                ? this.renderCaption(this.caption)
                : nothing}
          </div>`
        : nothing}

      <div
        class="ml-auto flex flex-shrink-0 flex-wrap items-start justify-end gap-2 md:col-start-2 md:row-start-3 lg:col-start-3 lg:row-start-1 lg:min-h-16 lg:pt-1"
      >
        <btrix-share-collection
          orgSlug=${this.orgSlugState || ""}
          collectionId=${this.collectionId}
          collectionName=${ifDefined(this.collectionName)}
          collectionSize=${ifDefined(this.collectionSize)}
          slug=${ifDefined(this.slug)}
          access=${ifDefined(this.access)}
          ?allowPublicDownload=${this.allowPublicDownload}
          context="private"
          @btrix-change=${(e: CustomEvent) => {
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent("btrix-collection-saved"));
          }}
        ></btrix-share-collection>
        ${when(isCrawler, () => html`<slot name="actions"></slot>`)}
      </div>
    </header>`;
  }

  private readonly renderThumbnail = () => {
    return html`
      <btrix-select-collection-thumbnail
        collectionId=${this.collectionId}
        homeUrl=${ifDefined(this.homeUrl)}
        homeUrlTs=${ifDefined(this.homeUrlTs)}
        thumbnailName=${ifDefined(this.thumbnailName)}
        thumbnailPath=${ifDefined(this.thumbnailPath)}
        pageCount=${ifDefined(this.pageCount)}
      ></btrix-select-collection-thumbnail>
    `;
  };

  private readonly renderName = (name: string) => {
    if (!this.appState.isCrawler) {
      return html`<div class="truncate">${name}</div>`;
    }

    return html`<btrix-editable-text-field
      label=${msg("Collection Name")}
      class="-m-4 overflow-hidden p-4"
      minLength=${1}
      maxLength=${COLLECTION_NAME_MAX_LENGTH}
      .value=${name}
      placeholder=${msg("Collection name")}
      @btrix-input=${(e: EditableTextFieldInputEvent) => {
        e.stopPropagation();

        const { value } = e.detail;

        this.slugPreview = value ? slugifyStrict(value) : "";
      }}
      @btrix-change=${(e: EditableTextFieldChangeEvent) => {
        e.stopPropagation();

        const value = e.detail.value.trim();

        if (value === name) {
          this.slugPreview = "";
        }

        void this.updateName(value);
      }}
      extraWidth=${24}
    >
      <span
        slot="suffix"
        class="ml-1 mt-0.5 inline-flex h-8 shrink-0 items-center"
      >
        <sl-icon
          name="pencil"
          class="size-3.5 text-neutral-600"
          aria-label=${msg("Edit Collection Name")}
        ></sl-icon>
      </span>
    </btrix-editable-text-field>`;
  };

  private readonly renderAccessDetails = () => {
    if (!this.access) {
      return html`<sl-skeleton class="h-4 w-12"></sl-skeleton>`;
    }

    const badge = html`<btrix-badge>
      <sl-icon
        name=${SelectCollectionAccess.Options[this.access].icon}
        class="mr-1.5"
      ></sl-icon>
      ${SelectCollectionAccess.Options[this.access].label}
    </btrix-badge>`;

    const publicLink = () => {
      const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
      const namespacedPath = `${RouteNamespace.PublicOrgs}/${this.orgSlugState}/${OrgTab.Collections}`;
      const slugPreview = this.slugPreview || this.slug || "";
      const link = new URL(`${baseUrl}/${namespacedPath}/${slugPreview}`).href;
      const displayUrl = html`<span class="break-all text-xs text-neutral-500">
        <span>${toShortUrl(baseUrl, null)}</span
        ><span title="/${namespacedPath}/">/.../</span
        ><span
          class=${clsx(
            tw`break-all text-xs`,
            this.slugPreview ? tw` text-blue-500` : tw`text-neutral-500`,
          )}
          >${slugPreview}</span
        >
      </span>`;

      return html` ${this.slugPreview
        ? displayUrl
        : html`<a
            class="group flex items-center gap-1.5"
            href=${link}
            target="_blank"
          >
            ${displayUrl}
            <sl-icon
              name="arrow-up-right"
              class="size-2.5 opacity-0 transition-opacity duration-fast group-hover:opacity-100"
            ></sl-icon>
          </a>`}`;
    };

    return html`<div class="flex items-start gap-1.5">
      ${badge} ${when(this.access !== CollectionAccess.Private, publicLink)}
    </div>`;
  };

  private readonly renderCaption = (text: string) => {
    return html`<btrix-prose
      class="[--btrix-line-clamp:2] part-[content]:max-w-full"
      >${richText(text, {
        linkClass: tw`text-cyan-500 transition-colors hover:text-cyan-600`,
      })}</btrix-prose
    >`;
  };

  private async updateName(name: string) {
    if (name === this.collectionName) {
      return;
    }

    try {
      await this.api.fetch<Collection>(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            slug: slugifyStrict(name),
          }),
        },
      );

      this.notify.toast({
        message: msg("Name updated."),
        variant: "success",
        icon: "check2-circle",
        id: "update",
      });

      this.dispatchEvent(
        new CustomEvent<CollectionSavedEvent["detail"]>(
          "btrix-collection-saved",
          {
            detail: {
              name,
              slug: this.slugPreview || this.slug || "",
            },
          },
        ),
      );

      this.slugPreview = "";
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn’t save collection name at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async updateSummary(caption: string) {
    caption = caption.trim();
    if (caption === this.caption) return;
    try {
      await this.api.fetch<Collection>(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            caption,
          }),
        },
      );

      this.notify.toast({
        message: msg("Summary updated."),
        variant: "success",
        icon: "check2-circle",
        id: "update",
      });

      this.dispatchEvent(
        new CustomEvent<CollectionSavedEvent["detail"]>(
          "btrix-collection-saved",
          {
            detail: { caption },
          },
        ),
      );
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn’t save collection summary at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "update",
      });
    }
  }
}
