import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { RouteNamespace } from "@/routes";
import type { PublicCollection } from "@/types/collection";
import { tw } from "@/utils/tailwind";
import thumbnailCyanSrc from "~assets/images/collections/thumbnail-cyan.avif";

/**
 * Grid view of collections list
 *
 * @TODO Generalize into collections, just handling public collections for now
 */
@localized()
@customElement("btrix-collections-grid")
export class CollectionsGrid extends BtrixElement {
  @property({ type: String })
  slug = "";

  @property({ type: Array })
  collections?: PublicCollection[];

  render() {
    const gridClassNames = tw`my-4 grid flex-1 grid-cols-1 gap-x-10 gap-y-16 md:grid-cols-2 lg:grid-cols-4`;

    if (!this.collections || !this.slug) {
      const thumb = html`
        <sl-skeleton
          class="block aspect-video [--border-radius:var(--sl-border-radius-large)]"
          effect="sheen"
        ></sl-skeleton>
      `;

      return html`
        <div class=${gridClassNames}>${thumb}${thumb}${thumb}${thumb}</div>
      `;
    }

    if (!this.collections.length) {
      return html`
        <p class="text-base text-neutral-500">
          ${msg("No public collections yet.")}
        </p>
      `;
    }

    return html`
      <ul class=${gridClassNames}>
        ${this.collections.map(
          (collection) => html`
            <li class="col-span-1">
              <a
                href="/${RouteNamespace.PublicOrgs}/${this
                  .slug}/collections/${collection.id}"
                class="group block rounded-lg ring-[1rem] ring-white transition-all hover:scale-[102%] hover:bg-cyan-50 hover:ring-cyan-50"
              >
                <div class="relative mb-4">
                  <img
                    class="aspect-video rounded-lg border border-cyan-100 bg-slate-50 object-cover shadow-md shadow-cyan-900/20 transition-shadow group-hover:shadow-sm"
                    src=${thumbnailCyanSrc}
                  />
                  ${this.renderDateBadge(collection)}
                </div>
                <div class="text-pretty leading-relaxed">
                  <strong
                    class="text-base font-medium text-stone-700 transition-colors group-hover:text-cyan-600"
                  >
                    ${collection.name}
                  </strong>
                  ${collection.caption &&
                  html`
                    <p
                      class="text-stone-400 transition-colors group-hover:text-cyan-600"
                    >
                      ${collection.caption}
                    </p>
                  `}
                </div>
              </a>
            </li>
          `,
        )}
      </ul>
    `;
  }

  renderDateBadge(collection: PublicCollection) {
    if (!collection.dateEarliest || !collection.dateLatest) return;

    const earliestYear = this.localize.date(collection.dateEarliest, {
      year: "numeric",
    });
    const latestYear = this.localize.date(collection.dateLatest, {
      year: "numeric",
    });

    return html`
      <btrix-badge variant="primary" class="absolute right-3 top-3">
        ${earliestYear}
        ${latestYear !== earliestYear ? html` - ${latestYear} ` : nothing}
      </btrix-badge>
    `;
  }
}
