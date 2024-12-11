import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { PublicCollection } from "@/types/collection";
import thumbnailCyanSrc from "~assets/images/thumbnails/thumbnail-cyan.avif";
import thumbnailGreenSrc from "~assets/images/thumbnails/thumbnail-green.avif";
import thumbnailOrangeSrc from "~assets/images/thumbnails/thumbnail-orange.avif";
import thumbnailYellowSrc from "~assets/images/thumbnails/thumbnail-yellow.avif";

export enum Thumbnail {
  Cyan = "thumbnail-cyan",
  Green = "thumbnail-green",
  Orange = "thumbnail-orange",
  Yellow = "thumbnail-yellow",
  Custom = "thumbnail-custom",
}

@localized()
@customElement("btrix-collection-thumbnail")
export class CollectionThumbnail extends BtrixElement {
  static readonly Variants: Record<
    Thumbnail,
    { fileName: string; src?: string }
  > = {
    [Thumbnail.Cyan]: {
      fileName: `${Thumbnail.Cyan}.avif`,
      src: thumbnailCyanSrc,
    },
    [Thumbnail.Green]: {
      fileName: `${Thumbnail.Green}.avif`,
      src: thumbnailGreenSrc,
    },
    [Thumbnail.Orange]: {
      fileName: `${Thumbnail.Orange}.avif`,
      src: thumbnailOrangeSrc,
    },
    [Thumbnail.Yellow]: {
      fileName: `${Thumbnail.Yellow}.avif`,
      src: thumbnailYellowSrc,
    },
    [Thumbnail.Custom]: {
      fileName: `${Thumbnail.Custom}.jpeg`,
    },
  };

  @property({ type: Object })
  thumbnail?: PublicCollection["thumbnail"];

  render() {
    console.log(this.thumbnail);

    return html`
      <img
        class="aspect-video rounded-lg border border-cyan-100 bg-slate-50 object-cover shadow-md shadow-cyan-900/20 transition-shadow group-hover:shadow-sm"
        src=${thumbnailCyanSrc}
      />
    `;
  }
}

export const DEFAULT_THUMBNAIL = CollectionThumbnail.Variants[Thumbnail.Cyan];
