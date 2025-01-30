import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { metadataColumn } from "@/layouts/collections/metadataColumn";
import { page } from "@/layouts/page";
import { RouteNamespace } from "@/routes";
import type { PublicCollection } from "@/types/collection";
import type { PublicOrgCollections } from "@/types/org";
import { formatRwpTimestamp } from "@/utils/replay";

enum Tab {
  Replay = "replay",
  About = "about",
}

@localized()
@customElement("btrix-collection")
export class Collection extends BtrixElement {
  @property({ type: String })
  orgSlug?: string;

  @property({ type: String })
  collectionSlug?: string;

  @property({ type: String })
  tab: Tab | string = Tab.Replay;

  get canEditCollection() {
    return this.orgSlug === this.orgSlugState && this.appState.isCrawler;
  }

  private readonly tabLabels: Record<
    Tab,
    { icon: { name: string; library: string }; text: string }
  > = {
    [Tab.Replay]: {
      icon: { name: "replaywebpage", library: "app" },
      text: msg("Browse Collection"),
    },
    [Tab.About]: {
      icon: { name: "info-square-fill", library: "default" },
      text: msg("About This Collection"),
    },
  };

  private readonly orgCollections = new Task(this, {
    task: async ([orgSlug]) => {
      if (!orgSlug) throw new Error("orgSlug required");
      const org = await this.fetchCollections({ orgSlug });
      return org;
    },
    args: () => [this.orgSlug] as const,
  });

  private readonly collection = new Task(this, {
    task: async ([orgSlug, collectionSlug]) => {
      if (!orgSlug || !collectionSlug)
        throw new Error("orgSlug and collection required");
      const collection = await this.fetchCollection({
        orgSlug,
        collectionSlug,
      });

      if (collection.slug !== collectionSlug) {
        this.navigate.to(
          `/${RouteNamespace.PublicOrgs}/${this.orgSlug}/collections/${collection.slug}`,
        );
      }

      if (!collection.crawlCount && (this.tab as unknown) === Tab.Replay) {
        this.tab = Tab.About;
      }

      return collection;
    },
    args: () => [this.orgSlug, this.collectionSlug] as const,
  });

  render() {
    return this.collection.render({
      complete: this.renderComplete,
      error: this.renderError,
    });
  }

  private readonly renderComplete = (collection: PublicCollection) => {
    const org = this.orgCollections.value?.org;
    const header: Parameters<typeof page>[0] = {
      breadcrumbs:
        this.orgCollections.status > TaskStatus.PENDING
          ? org
            ? [
                {
                  href: `/${RouteNamespace.PublicOrgs}/${this.orgSlug}`,
                  content: org.name,
                },
              ]
            : undefined
          : [],
      title: collection.name || "",
      actions: html`
        <btrix-share-collection
          orgSlug=${this.orgSlug || ""}
          collectionId=${collection.id}
          .collection=${collection}
        ></btrix-share-collection>
        ${when(
          this.canEditCollection,
          () => html`
            <sl-button
              href="${this.navigate
                .orgBasePath}/collections/view/${collection.id}"
              size="small"
              variant="text"
              class="-mx-3"
              @click=${this.navigate.link}
            >
              ${msg("Go to Private Page")}
            </sl-button>
          `,
        )}
      `,
    };

    if (collection.caption) {
      header.secondary = html`
        <div class="text-pretty text-stone-500">${collection.caption}</div>
      `;
    }

    const panel = (tab: Tab, content: TemplateResult) => html`
      <div
        class=${(this.tab as Tab) !== tab
          ? "offscreen"
          : "flex-1 flex flex-col"}
      >
        ${content}
      </div>
    `;

    return html`
      ${page(
        header,
        () => html`
          <nav class="mb-3 flex gap-2">
            ${when(collection.crawlCount, () => this.renderTab(Tab.Replay))}
            ${this.renderTab(Tab.About)}
          </nav>

          ${when(collection.crawlCount, () =>
            panel(Tab.Replay, this.renderReplay(collection)),
          )}
          ${panel(Tab.About, this.renderAbout(collection))}
        `,
      )}
    `;
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
        href=${`/${RouteNamespace.PublicOrgs}/${this.orgSlug}/collections/${this.collectionSlug}/${tab}`}
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
      `/api/orgs/${collection.oid}/collections/${collection.id}/public/replay.json`,
      window.location.href,
    ).href;

    return html`
      <section class="h-[calc(100vh-4rem)] overflow-hidden rounded-lg border">
        <replay-web-page
          source=${replaySource}
          url=${ifDefined(collection.homeUrl || undefined)}
          ts=${ifDefined(
            collection.homeUrlTs
              ? formatRwpTimestamp(collection.homeUrlTs)
              : undefined,
          )}
          replayBase="/replay/"
          noSandbox="true"
          noCache="true"
        ></replay-web-page>
      </section>
    `;
  }

  private renderAbout(collection: PublicCollection) {
    const metadata = metadataColumn(collection);

    if (collection.description) {
      return html`
        <div class="flex flex-1 flex-col gap-10 lg:flex-row">
          <section
            class="w-full max-w-4xl py-3 leading-relaxed lg:rounded-lg lg:border lg:p-6"
          >
            <btrix-markdown-viewer
              value=${collection.description}
            ></btrix-markdown-viewer>
          </section>
          <section class="flex-1 lg:-mt-8">
            <btrix-section-heading>
              <h3>${msg("Metadata")}</h3>
            </btrix-section-heading>
            <div class="mt-5">${metadata}</div>
          </section>
        </div>
      `;
    }

    return html`<div class="rounded-lg border p-6">${metadata}</div>`;
  }

  private async fetchCollections({
    orgSlug,
  }: {
    orgSlug: string;
  }): Promise<PublicOrgCollections> {
    const resp = await fetch(`/api/public/orgs/${orgSlug}/collections`, {
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
    orgSlug,
    collectionSlug,
  }: {
    orgSlug: string;
    collectionSlug: string;
  }): Promise<PublicCollection> {
    const resp = await fetch(
      `/api/public/orgs/${orgSlug}/collections/${collectionSlug}`,
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
