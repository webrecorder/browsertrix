import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";
import { customElement, property, queryAssignedNodes } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { keyed } from "lit/directives/keyed.js";
import { when } from "lit/directives/when.js";

import { CollectionThumbnail } from "./collection-thumbnail";
import { SelectCollectionAccess } from "./select-collection-access";

import { BtrixElement } from "@/classes/BtrixElement";
import { textSeparator } from "@/layouts/separator";
import { RouteNamespace } from "@/routes";
import { CollectionAccess, type PublicCollection } from "@/types/collection";
import { pluralOf } from "@/utils/pluralize";
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

  @property({ type: String })
  collectionRefreshing: string | null = null;

  @property({ type: Boolean })
  showVisibility = false;

  @property()
  renderActions?: (collection: PublicCollection) => TemplateResult;

  @queryAssignedNodes({ slot: "pagination" })
  pagination!: Node[];

  render() {
    const gridClassNames = tw`grid flex-1 grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3`;

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
            <slot name="empty-text">
              ${msg("No public collections yet.")}
            </slot>
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
                  ${
                    // When swapping images, the previous image is retained until the new one is loaded,
                    // which leads to the wrong image briefly being displayed when switching pages.
                    // This removes and replaces the image instead, which prevents this at the cost of the
                    // occasional flash of white while loading, but overall this feels more responsive.
                    keyed(
                      collection.id,
                      html` <btrix-collection-thumbnail
                        src=${ifDefined(
                          Object.entries(CollectionThumbnail.Variants).find(
                            ([name]) =>
                              name === collection.defaultThumbnailName,
                          )?.[1].path || collection.thumbnail?.path,
                        )}
                        collectionName=${collection.name}
                      ></btrix-collection-thumbnail>`,
                    )
                  }
                  ${this.renderDateBadge(collection)}
                </div>
                <div class="${showActions ? "mr-9" : ""} min-h-9 leading-tight">
                  ${this.showVisibility
                    ? html`<sl-tooltip
                        content=${SelectCollectionAccess.Options[
                          collection.access
                        ].label}
                      >
                        <sl-icon
                          class=${clsx(
                            "mr-[5px] inline-block align-[-1px]",
                            collection.access === CollectionAccess.Public
                              ? "text-success-600"
                              : "text-neutral-600",
                          )}
                          name=${SelectCollectionAccess.Options[
                            collection.access
                          ].icon}
                        ></sl-icon>
                      </sl-tooltip>`
                    : nothing}
                  <strong
                    class="text-base font-medium leading-tight text-stone-800 transition-colors group-hover:text-cyan-600"
                  >
                    ${collection.name}
                  </strong>
                  <div class="mt-1.5 flex gap-2 leading-tight text-stone-400">
                    <div>
                      ${this.localize.number(collection.pageCount)}
                      ${pluralOf("pages", collection.pageCount)}
                    </div>
                    ${textSeparator()}
                    <div>${this.localize.bytes(collection.totalSize)}</div>
                  </div>
                  ${collection.caption &&
                  html`
                    <p
                      class="mt-1.5 text-pretty leading-relaxed text-stone-500"
                    >
                      ${collection.caption}
                    </p>
                  `}
                </div>
              </a>
              ${when(showActions, () => this._renderActions(collection))}
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

      <slot
        class=${clsx("justify-center flex", this.pagination.length && "mt-10")}
        name="pagination"
      ></slot>
    `;
  }

  private readonly _renderActions = (collection: PublicCollection) => html`
    <div class="pointer-events-none absolute left-0 right-0 top-0 aspect-video">
      <div class="pointer-events-auto absolute bottom-2 right-2">
        ${this.renderActions
          ? this.renderActions(collection)
          : html`<sl-tooltip content=${msg("Edit Collection Settings")}>
              <btrix-button
                raised
                size="small"
                @click=${() => {
                  this.dispatchEvent(
                    new CustomEvent<string>("btrix-edit-collection", {
                      detail: collection.id,
                    }),
                  );
                }}
              >
                <sl-icon name="pencil"></sl-icon>
              </btrix-button>
            </sl-tooltip>`}
      </div>
    </div>
  `;

  renderDateBadge(collection: PublicCollection) {
    if (!collection.dateEarliest || !collection.dateLatest) return;

    const earliestYear = this.localize.date(collection.dateEarliest, {
      year: "numeric",
    });
    const latestYear = this.localize.date(collection.dateLatest, {
      year: "numeric",
    });

    let date = "";

    if (earliestYear === latestYear) {
      const earliestMonth = new Date(collection.dateEarliest).getMonth();
      const latestMonth = new Date(collection.dateLatest).getMonth();

      if (earliestMonth === latestMonth) {
        date = this.localize.date(collection.dateEarliest, {
          month: "long",
          year: "numeric",
        });
      } else {
        date = `${this.localize.date(collection.dateEarliest, {
          month: "short",
        })} – ${this.localize.date(collection.dateLatest, {
          month: "short",
          year: "numeric",
        })}`;
      }
    } else {
      date = `${earliestYear} – ${latestYear} `;
    }

    return html`
      <btrix-badge variant="primary" class="absolute right-3 top-3">
        ${date}
      </btrix-badge>
    `;
  }
}
