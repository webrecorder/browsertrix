import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import thumbnailCyanSrc from "~assets/images/thumbnails/thumbnail-cyan.avif";
import thumbnailGreenSrc from "~assets/images/thumbnails/thumbnail-green.avif";
import thumbnailOrangeSrc from "~assets/images/thumbnails/thumbnail-orange.avif";
import thumbnailYellowSrc from "~assets/images/thumbnails/thumbnail-yellow.avif";

export enum Thumbnail {
  Cyan = "thumbnail-cyan",
  Green = "thumbnail-green",
  Orange = "thumbnail-orange",
  Yellow = "thumbnail-yellow",
}

export const DEFAULT_THUMBNAIL = Thumbnail.Cyan;

@localized()
@customElement("btrix-collection-thumbnail")
export class CollectionThumbnail extends BtrixElement {
  static readonly Variants: Record<Thumbnail, { path: string }> = {
    [Thumbnail.Cyan]: {
      path: thumbnailCyanSrc,
    },
    [Thumbnail.Green]: {
      path: thumbnailGreenSrc,
    },
    [Thumbnail.Orange]: {
      path: thumbnailOrangeSrc,
    },
    [Thumbnail.Yellow]: {
      path: thumbnailYellowSrc,
    },
  };

  @property({ type: String })
  src?: string;

  render() {
    return html`
      <img
        class="aspect-video size-full rounded-lg bg-slate-50 object-cover"
        src=${this.src || DEFAULT_THUMBNAIL_VARIANT.path}
      />
    `;
  }
}

export const DEFAULT_THUMBNAIL_VARIANT =
  CollectionThumbnail.Variants[DEFAULT_THUMBNAIL];
