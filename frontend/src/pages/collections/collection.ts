import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { SelectVisibilityDetail } from "@/features/collections/share-collection";
import { page } from "@/layouts/page";
import { RouteNamespace } from "@/routes";
import type { PublicCollection } from "@/types/collection";
import type { PublicOrgCollections } from "@/types/org";

enum Tab {
  Replay = "replay",
  About = "about",
}

@localized()
@customElement("btrix-collection")
export class Collection extends BtrixElement {
  @property({ type: String })
  slug?: string;

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  tab: Tab | string = Tab.Replay;

  private readonly tabLabels: Record<
    Tab,
    { icon: { name: string; library: string }; text: string }
  > = {
    [Tab.Replay]: {
      icon: { name: "replaywebpage", library: "app" },
      text: msg("Replay"),
    },
    [Tab.About]: {
      icon: { name: "info-square-fill", library: "default" },
      text: msg("About"),
    },
  };

  private readonly orgCollections = new Task(this, {
    task: async ([slug]) => {
      if (!slug) return;
      const org = await this.fetchCollections({ slug });
      return org;
    },
    args: () => [this.slug] as const,
  });

  private readonly collection = new Task(this, {
    task: async ([slug, collectionId]) => {
      if (!slug || !collectionId) return;
      const org = await this.fetchCollection({ slug, collectionId });
      return org;
    },
    args: () => [this.slug, this.collectionId] as const,
  });

  render() {
    return this.collection.render({
      complete: this.renderComplete,
      error: this.renderError,
    });
  }

  private readonly renderComplete = (collection: PublicCollection | void) => {
    if (!collection) {
      return this.renderError();
    }

    const header: Parameters<typeof page>[0] = {
      title: collection.name || "",
      actions: html`
        <btrix-share-collection
          collectionId=${ifDefined(this.collectionId)}
          .collection=${collection}
          @btrix-select-visibility=${(
            e: CustomEvent<SelectVisibilityDetail>,
          ) => {
            e.stopPropagation();
            console.log("TODO");
          }}
        ></btrix-share-collection>
      `,
    };

    if (collection.caption) {
      header.secondary = html`
        <div class="text-pretty text-stone-600">${collection.caption}</div>
      `;
    }

    return page(
      header,
      () => html`
        <nav class="mb-3 flex gap-2">
          ${Object.values(Tab).map(this.renderTab)}
        </nav>

        <section class=${(this.tab as Tab) !== Tab.Replay ? "offscreen" : ""}>
          ${this.renderReplay(collection)}
        </section>
        <section class=${(this.tab as Tab) !== Tab.About ? "offscreen" : ""}>
          ${this.renderAbout(collection)}
        </section>
      `,
    );
  };

  private readonly renderError = (error?: unknown) => {
    console.log("error", error);

    return html` <div class="flex size-full items-center justify-center">
      <btrix-not-found></btrix-not-found>
    </div>`;
  };

  private readonly renderTab = (tab: Tab) => {
    const isSelected = tab === (this.tab as Tab);

    return html`
      <btrix-navigation-button
        .active=${isSelected}
        aria-selected="${isSelected}"
        href=${`/${RouteNamespace.PublicOrgs}/${this.slug}/collections/${this.collectionId}/${tab}`}
        @click=${this.navigate.link}
      >
        <sl-icon
          name=${this.tabLabels[tab].icon.name}
          library=${this.tabLabels[tab].icon.library}
        ></sl-icon>
        ${this.tabLabels[tab].text}</btrix-navigation-button
      >
    `;
  };

  private renderReplay(collection: PublicCollection) {
    const replaySource = new URL(
      `/api/orgs/${collection.oid}/collections/${this.collectionId}/public/replay.json`,
      window.location.href,
    ).href;

    return html`
      <section class="aspect-4/3 overflow-hidden rounded-lg border">
        <replay-web-page
          source=${replaySource}
          replayBase="/replay/"
          noSandbox="true"
          noCache="true"
        ></replay-web-page>
      </section>
    `;
  }

  private renderAbout(collection: PublicCollection) {
    return html`
      <div class="mt-6 flex gap-7">
        <section class="flex-1">
          <h3 class="mb-3 text-lg font-semibold leading-none">
            ${msg("Description")}
          </h3>
          <div class="rounded-lg border p-5">
            ${collection.description
              ? html`
                  <btrix-markdown-viewer
                    value=${collection.description}
                  ></btrix-markdown-viewer>
                `
              : html`<p class="text-center text-neutral-400">
                  ${msg(
                    "A description has not been provided for this collection.",
                  )}
                </p>`}
          </div>
        </section>
        <section class="w-96 flex-shrink-0">
          <h3 class="mb-5 text-lg font-semibold leading-none">
            ${msg("Metadata")}
          </h3>
          <btrix-desc-list>
            <btrix-desc-list-item label=${msg("Archived Items")}>
              ${this.localize.number(collection.crawlCount)}
            </btrix-desc-list-item>
            <btrix-desc-list-item label=${msg("Total Pages")}>
              ${this.localize.number(collection.pageCount)}
            </btrix-desc-list-item>
            <btrix-desc-list-item label=${msg("Total Size")}>
              ${this.localize.bytes(collection.totalSize)}
            </btrix-desc-list-item>
            <btrix-desc-list-item label=${msg("Date Range")}>
              TODO
            </btrix-desc-list-item>
          </btrix-desc-list>
        </section>
      </div>
    `;
  }

  private async fetchCollections({
    slug,
  }: {
    slug: string;
  }): Promise<PublicOrgCollections | void> {
    const resp = await fetch(`/api/public/orgs/${slug}/collections`, {
      headers: { "Content-Type": "application/json" },
    });

    switch (resp.status) {
      case 200:
        return (await resp.json()) as PublicOrgCollections;
      default:
        throw resp.status;
    }
  }

  private async fetchCollection({
    slug,
    collectionId,
  }: {
    slug: string;
    collectionId: string;
  }): Promise<PublicCollection | void> {
    const resp = await fetch(
      `/api/public/orgs/${slug}/collections/${collectionId}`,
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    switch (resp.status) {
      case 200:
        return (await resp.json()) as PublicCollection;
      default:
        throw resp.status;
    }
  }
}
