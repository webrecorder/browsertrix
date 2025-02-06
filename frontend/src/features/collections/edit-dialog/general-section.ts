import { msg } from "@lit/localize";
import { TaskStatus } from "@lit/task";
import { type SlInput } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing } from "lit";
import { isEqual } from "lodash";
import queryString from "query-string";

import {
  validateCaptionMax,
  validateNameMax,
  type CollectionEdit,
} from "../collection-edit-dialog";
import { type BtrixValidateDetails } from "../collection-snapshot-preview";
import {
  CollectionThumbnail,
  DEFAULT_THUMBNAIL_VARIANT,
  Thumbnail,
} from "../collection-thumbnail";
import { type SelectSnapshotDetail } from "../select-collection-page";

import { snapshotToSource, sourceToSnapshot } from "./helpers/snapshots";

import type { PublicCollection } from "@/types/collection";
import { tw } from "@/utils/tailwind";

export default function renderGeneral(this: CollectionEdit) {
  if (!this.collection) return;
  return html`<sl-input
      class="with-max-help-text"
      name="name"
      label=${msg("Name")}
      value=${this.collection.name}
      placeholder=${msg("My Collection")}
      autocomplete="off"
      required
      help-text=${validateNameMax.helpText}
      @sl-input=${(e: CustomEvent) => {
        this.validate(validateNameMax)(e);
        this.name = (e.target as SlInput).value;
      }}
    >
    </sl-input>
    <sl-input
      class="with-max-help-text"
      name="caption"
      value=${this.collection.caption ?? ""}
      placeholder=${msg("Summarize the collection's content")}
      autocomplete="off"
      help-text=${validateCaptionMax.helpText}
      @sl-input=${this.validate(validateCaptionMax)}
    >
      <span slot="label">
        ${msg("Summary")}
        <sl-tooltip>
          <span slot="content">
            ${msg(
              "Write a short description that summarizes this collection. If the collection is public, this description will be visible next to the collection name.",
            )}
          </span>
          <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
        </sl-tooltip>
      </span>
    </sl-input>
    <div class="mb-7">${renderThumbnails.bind(this)()}</div>
    <section>
      <btrix-select-collection-page
        mode="thumbnail"
        .collection=${this.collection}
        .collectionId=${this.collection.id}
        .selectedSnapshot=${sourceToSnapshot(this.selectedSnapshot) ??
        undefined}
        @btrix-select=${async (e: CustomEvent<SelectSnapshotDetail>) => {
          if (!e.detail.item) return;
          await this.updateComplete;
          this.selectedSnapshot = snapshotToSource(e.detail.item);
          void this.checkChanged();
        }}
      >
        ${this.thumbnailPreview?.blobTask.status === TaskStatus.PENDING
          ? html`<sl-spinner slot="prefix"></sl-spinner>`
          : nothing}
        ${this.thumbnailPreview?.blobTask.status === TaskStatus.ERROR
          ? html` <sl-tooltip
              hoist
              content=${msg(
                "This page doesn’t have a thumbnail and can’t be used",
              )}
              placement="bottom-start"
            >
              <sl-icon
                name="exclamation-lg"
                class="size-4 text-base text-danger"
              ></sl-icon>
            </sl-tooltip>`
          : nothing}
      </btrix-select-collection-page>
      <sl-checkbox
        name="setInitialView"
        class="mt-3 part-[form-control-help-text]:text-balance"
        checked
        ?disabled=${!this.selectedSnapshot}
        help-text=${msg(
          "Update the first page that you see when replaying this collection",
        )}
      >
        ${msg("Set initial view to this page")}
      </sl-checkbox>
    </section> `;
}

function renderThumbnails(this: CollectionEdit) {
  let selectedImgSrc: string | null = DEFAULT_THUMBNAIL_VARIANT.path;

  if (this.defaultThumbnailName) {
    const variant = Object.entries(CollectionThumbnail.Variants).find(
      ([name]) => name === this.defaultThumbnailName,
    );

    if (variant) {
      selectedImgSrc = variant[1].path;
    }
  } else if (this.collection?.thumbnail) {
    selectedImgSrc = this.collection.thumbnail.path;
  } else {
    selectedImgSrc = null;
  }

  const thumbnail = (
    thumbnail?: Thumbnail | NonNullable<PublicCollection["thumbnail"]>,
  ) => {
    let name: Thumbnail | null = null;
    let path = "";

    if (!thumbnail)
      return html` <sl-tooltip content=${msg("Select a page thumbnail")}
        ><button
          class="row-start-2 flex aspect-video min-w-48 items-center justify-center overflow-hidden rounded bg-neutral-50 ring-1 ring-stone-600/10 transition-all hover:ring-2 hover:ring-blue-300"
          disabled
          role="radio"
          type="button"
          aria-checked=${false}
        >
          <sl-icon
            class="size-10 stroke-black/50 text-white drop-shadow-md [paint-order:stroke]"
            name="plus-lg"
          ></sl-icon></button
      ></sl-tooltip>`;

    if (typeof thumbnail === "string") {
      // we know that the thumbnail here is one of the placeholders
      name = thumbnail;
      path = CollectionThumbnail.Variants[name].path;
    } else {
      path = thumbnail.path;
    }

    if (!path) {
      console.error("no path for thumbnail:", thumbnail);
      return;
    }

    const isSelected = path === selectedImgSrc;

    return html`
      <sl-tooltip content=${msg("Use thumbnail")}>
        <button
          class="${isSelected
            ? "ring-blue-300 ring-2"
            : "ring-stone-600/10 ring-1"} row-start-2 aspect-video min-w-48 overflow-hidden rounded transition-all hover:ring-2 hover:ring-blue-300"
          role="radio"
          type="button"
          aria-checked=${isSelected}
          @click=${() => {
            this.defaultThumbnailName = name;
            void this.checkChanged.bind(this)();
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
    <fieldset
      role="radiogroup"
      aria-labelledby="collection-thumbnail-selector"
      class="contents"
    >
      <label
        id="collection-thumbnail-selector"
        class="form-label flex items-center gap-1.5"
      >
        ${msg("Thumbnail")}
        <sl-tooltip
          content=${msg(
            "Choose a thumbnail to represent this collection in the org dashboard and profile page.",
          )}
        >
          <sl-icon name="info-circle"></sl-icon>
        </sl-tooltip>
      </label>
      <div class="-mx-4 -my-2 -mt-1 overflow-x-auto px-4 py-2">
        <div class="grid w-max min-w-full grid-rows-[auto_auto] gap-3">
          <div class="row-start-1 text-xs text-neutral-500">
            ${msg("Page Thumbnail")}
          </div>
          ${renderPageThumbnail.bind(this)(
            this.defaultThumbnailName == null
              ? this.collection?.thumbnail?.path
              : null,
          )}
          <div class="sticky left-0 row-start-1 text-xs text-neutral-600">
            ${msg("Placeholder")}
          </div>
          ${thumbnail(Thumbnail.Cyan)} ${thumbnail(Thumbnail.Green)}
          ${thumbnail(Thumbnail.Yellow)} ${thumbnail(Thumbnail.Orange)}
        </div>
      </div>
    </fieldset>
  `;
}

function renderPageThumbnail(
  this: CollectionEdit,
  initialPath?: string | null,
) {
  const replaySource = `/api/orgs/${this.orgId}/collections/${this.collection!.id}/replay.json`;
  // TODO Get query from replay-web-page embed
  const query = queryString.stringify({
    source: replaySource,
    customColl: this.collection!.id,
    embed: "default",
    noCache: 1,
    noSandbox: 1,
  });

  const isSelected = this.defaultThumbnailName == null;

  this.thumbnailPreview?.thumbnailBlob
    .then((value) => {
      this.blobIsLoaded = !!value;
    })
    .catch(() => {
      this.blobIsLoaded = false;
    });

  console.log({
    selectedSnapshot: this.selectedSnapshot,
    blobIsLoaded: !!this.blobIsLoaded,
    initialPath: !!initialPath,
  });

  return html`
    <button
      class=${clsx(
        isSelected ? tw`ring-2 ring-blue-300` : tw` ring-1 ring-stone-600/10`,
        tw`row-start-2 aspect-video min-w-48 overflow-hidden rounded transition-all hover:ring-2 hover:ring-blue-300`,
      )}
      role="radio"
      type="button"
      aria-checked=${isSelected}
      @click=${() => {
        this.thumbnailSelector?.input?.focus();
        this.defaultThumbnailName = null;
        void this.checkChanged.bind(this)();
      }}
    >
      <div
        class="relative grid size-full place-items-center bg-cover"
        style="background-image:url('${initialPath}')"
      >
        ${isSelected
          ? html`<sl-icon
              class="absolute z-10 size-10 stroke-black/50 text-white drop-shadow-md [paint-order:stroke]"
              name="check-lg"
            ></sl-icon>`
          : nothing}

        <btrix-collection-snapshot-preview
          class="absolute inset-0"
          id="thumbnailPreview"
          collectionId=${this.collection!.id || ""}
          view="url"
          replaySrc=${`/replay/?${query}#view=pages`}
          .snapshot=${sourceToSnapshot(this.selectedSnapshot)}
          ?noSpinner=${!!initialPath &&
          !isEqual(this.selectedSnapshot, this.collection?.thumbnailSource)}
          @btrix-validate=${({
            detail: { valid },
          }: CustomEvent<BtrixValidateDetails>) => {
            if (this.defaultThumbnailName == null && !valid) {
              this.errorTab = "general";
            } else {
              this.errorTab = null;
            }
          }}
        >
        </btrix-collection-snapshot-preview>
      </div>
    </button>
  `;
}
