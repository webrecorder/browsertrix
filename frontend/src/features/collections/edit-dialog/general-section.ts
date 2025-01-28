import { msg } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import { when } from "lit/directives/when.js";

import {
  validateCaptionMax,
  validateNameMax,
  type CollectionEdit,
} from "../collection-edit-dialog";
import {
  CollectionThumbnail,
  DEFAULT_THUMBNAIL_VARIANT,
  Thumbnail,
} from "../collection-thumbnail";

import type { PublicCollection } from "@/types/collection";

export default function renderGeneral(this: CollectionEdit) {
  if (!this.collection) return;
  return html`<sl-input
      class="with-max-help-text part-[input]:text-base part-[input]:font-semibold"
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
    <sl-textarea
      class="with-max-help-text"
      name="caption"
      value=${this.collection.caption ?? ""}
      placeholder=${msg("Summarize the collection's content")}
      autocomplete="off"
      rows="2"
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
    </sl-textarea>
    <div class="mb-7">${renderThumbnails.bind(this)()}</div>
    <btrix-collection-thumbnail-select
      .collection=${this.collection}
      .replayLoaded=${this.replayLoaded}
    >
    </btrix-collection-thumbnail-select>`;
}

function renderThumbnails(this: CollectionEdit) {
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
    thumbnail?: Thumbnail | NonNullable<PublicCollection["thumbnail"]>,
  ) => {
    let name: Thumbnail | null = null;
    let path = "";

    if (!thumbnail)
      return html` <sl-tooltip content=${msg("Select a page thumbnail")}
        ><button
          class="row-start-2 flex aspect-video items-center justify-center overflow-hidden rounded bg-neutral-50 ring-1 ring-stone-600/10 transition-all hover:ring-2 hover:ring-blue-300"
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
            : "ring-stone-600/10 ring-1"} row-start-2 aspect-video flex-1 overflow-hidden rounded transition-all hover:ring-2 hover:ring-blue-300"
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
    <fieldset role="radiogroup" aria-labelledby="collection-thumbnail-selector">
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
      <div class="mt-3 grid grid-cols-5 gap-3">
        <div class="row-start-1 text-xs text-neutral-500">
          ${msg("Page Thumbnail")}
        </div>
        ${when(
          this.collection?.thumbnail,
          (t) => thumbnail(t),
          () => thumbnail(),
        )}
        <div class="row-start-1 text-xs text-neutral-600">
          ${msg("Placeholder")}
        </div>
        ${thumbnail(Thumbnail.Cyan)} ${thumbnail(Thumbnail.Green)}
        ${thumbnail(Thumbnail.Yellow)} ${thumbnail(Thumbnail.Orange)}
      </div>
    </fieldset>
  `;
}
