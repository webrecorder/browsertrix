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
  // Custom = "thumbnail-custom",
}

@localized()
@customElement("btrix-collection-thumbnail")
export class CollectionThumbnail extends BtrixElement {
  static readonly Variants: Record<Thumbnail, { name: string; path: string }> =
    {
      [Thumbnail.Cyan]: {
        name: `${Thumbnail.Cyan}.avif`,
        path: thumbnailCyanSrc,
      },
      [Thumbnail.Green]: {
        name: `${Thumbnail.Green}.avif`,
        path: thumbnailGreenSrc,
      },
      [Thumbnail.Orange]: {
        name: `${Thumbnail.Orange}.avif`,
        path: thumbnailOrangeSrc,
      },
      [Thumbnail.Yellow]: {
        name: `${Thumbnail.Yellow}.avif`,
        path: thumbnailYellowSrc,
      },
      // [Thumbnail.Custom]: {
      //   name: `${Thumbnail.Custom}.jpeg`,
      // },
    };

  @property({ type: String })
  src?: string;

  render() {
    return html`
      <img
        class="aspect-video rounded-lg border border-cyan-100 bg-slate-50 object-cover"
        src=${this.src || DEFAULT_THUMBNAIL.path!}
      />
    `;
  }
}

export const DEFAULT_THUMBNAIL = CollectionThumbnail.Variants[Thumbnail.Cyan];
