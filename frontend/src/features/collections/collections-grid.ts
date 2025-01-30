import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { CollectionThumbnail } from "./collection-thumbnail";

import { BtrixElement } from "@/classes/BtrixElement";
import { RouteNamespace } from "@/routes";
import type { PublicCollection } from "@/types/collection";
import { tw } from "@/utils/tailwind";

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

  @state()
  collectionBeingEdited: string | null = null;

  @property({ type: String })
  collectionRefreshing: string | null = null;

  render() {
    const gridClassNames = tw`grid flex-1 grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`;

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
        <div class="flex flex-col items-center justify-center gap-3 px-3 py-10">
          <p class="text-base text-neutral-500">
            ${msg("No public collections yet.")}
          </p>
          <slot name="empty-actions"></slot>
        </div>
      `;
    }

    const showActions = !this.navigate.isPublicPage && this.appState.isCrawler;

    return html`
      <ul class=${gridClassNames}>
        ${this.collections.map(
          (collection) => html`
            <li class="group relative col-span-1">
              <a
                href=${this.navigate.isPublicPage
                  ? `/${RouteNamespace.PublicOrgs}/${this.slug}/collections/${collection.slug}`
                  : `/${RouteNamespace.PrivateOrgs}/${this.slug}/collections/view/${collection.id}`}
                class=${clsx(
                  tw`block h-full rounded-lg transition-opacity`,
                  this.collectionRefreshing === collection.id && tw`opacity-50`,
                )}
                @click=${this.navigate.link}
              >
                <div
                  class="relative mb-4 rounded-lg shadow-md shadow-stone-600/10 ring-1 ring-stone-600/10 transition group-hover:shadow-stone-800/20 group-hover:ring-stone-800/20"
                >
                  <btrix-collection-thumbnail
                    src=${ifDefined(
                      Object.entries(CollectionThumbnail.Variants).find(
                        ([name]) => name === collection.defaultThumbnailName,
                      )?.[1].path || collection.thumbnail?.path,
                    )}
                  ></btrix-collection-thumbnail>
                  ${this.renderDateBadge(collection)}
                </div>
                <div class="${showActions ? "mr-9" : ""} min-h-9 leading-tight">
                  <strong
                    class="text-base font-medium leading-tight text-stone-700 transition-colors group-hover:text-cyan-600"
                  >
                    ${collection.name}
                  </strong>
                  ${collection.caption &&
                  html`
                    <p
                      class="mt-1.5 text-pretty leading-relaxed text-stone-500 transition-colors group-hover:text-cyan-600"
                    >
                      ${collection.caption}
                    </p>
                  `}
                </div>
              </a>
              ${when(showActions, () => this.renderActions(collection))}
              ${when(
                this.collectionRefreshing === collection.id,
                () =>
                  html`<div
                    class="absolute inset-x-0 top-0 z-50 grid aspect-video place-items-center"
                  >
                    <sl-spinner class="text-4xl"></sl-spinner>
                  </div>`,
              )}
            </li>
          `,
        )}
      </ul>
      ${when(
        showActions,
        () =>
          html`<btrix-collection-edit-dialog
            .collectionId=${this.collectionBeingEdited ?? undefined}
            ?open=${!!this.collectionBeingEdited}
            @sl-after-hide=${() => {
              this.collectionBeingEdited = null;
              // TODO propagate an event back up & refresh collections
              // void this.fetchCollection();
            }}
          ></btrix-collection-edit-dialog>`,
      )}
    `;
  }

  private readonly renderActions = (collection: PublicCollection) => html`
    <div class="pointer-events-none absolute left-0 right-0 top-0 aspect-video">
      <div class="pointer-events-auto absolute bottom-2 right-2">
        <btrix-button raised size="small">
          <sl-icon
            label=${msg("Edit Collection")}
            name="pencil"
            @click=${() => {
              this.collectionBeingEdited = collection.id;
            }}
          ></sl-icon>
        </btrix-button>
      </div>
    </div>
  `;

  private renderDateBadge(collection: PublicCollection) {
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
        ${latestYear !== earliestYear ? html` – ${latestYear} ` : nothing}
      </btrix-badge>
    `;
  }
}
