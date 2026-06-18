import { provide } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import type { ReplayWebPage, RwpUrlChangeEvent } from "replaywebpage";

import { BtrixElement } from "@/classes/BtrixElement";
import { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import { metadataColumn } from "@/layouts/collections/metadataColumn";
import { page } from "@/layouts/page";
import { collectionRwpContext } from "@/pages/org/collection-detail/context/collection-rwp";
import { type CollectionSavedEvent } from "@/pages/org/collection-detail/types";
import { CommonTab, OrgTab, RouteNamespace } from "@/routes";
import { CollectionAccess, type PublicCollection } from "@/types/collection";
import { formatRwpTimestamp } from "@/utils/replay";

import "@/features/collections/collection-page-header";

enum PublicTab {
  Replay = "replay",
  About = "about",
}

@localized()
@customElement("btrix-collection")
export class Collection extends BtrixElement {
  @provide({ context: collectionRwpContext })
  replayEmbed?: ReplayWebPage | null;

  @property({ type: String })
  orgSlug?: string;

  @property({ type: String })
  collectionSlug?: string;

  @property({ type: String })
  tab: PublicTab | string = PublicTab.Replay;

  @state()
  private showEditDialog = false;

  get canEditCollection() {
    return this.orgSlug === this.orgSlugState && this.appState.isCrawler;
  }

  get privatePageUrl() {
    return `${this.navigate.orgBasePath}/${OrgTab.Collections}/${CommonTab.View}/${this.collection.value?.id ?? ""}`;
  }

  private readonly tabLabels: Record<
    PublicTab,
    { icon: { name: string; library: string }; text: string }
  > = {
    [PublicTab.Replay]: {
      icon: { name: "replaywebpage", library: "app" },
      text: msg("Browse Collection"),
    },
    [PublicTab.About]: {
      icon: { name: "info-square-fill", library: "default" },
      text: msg("About This Collection"),
    },
  };

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

      if (
        !collection.crawlCount &&
        (this.tab as unknown) === PublicTab.Replay
      ) {
        this.tab = PublicTab.About;
      }

      return collection;
    },
    args: () => [this.orgSlug, this.collectionSlug] as const,
  });

  render() {
    return html`
      ${this.collection.render({
        complete: this.renderComplete,
        pending: () =>
          this.collection.value
            ? this.renderComplete(this.collection.value)
            : // TODO Add skeleton layout
              nothing,
        error: this.renderError,
      })}
      ${when(
        this.collection.value,
        (collection) =>
          html`<btrix-collection-edit-dialog
            .collection=${collection}
            ?open=${this.showEditDialog}
            @sl-hide=${() => (this.showEditDialog = false)}
            @btrix-collection-saved=${async (e: CollectionSavedEvent) => {
              if (e.detail?.access === CollectionAccess.Private) {
                // Redirect to private page
                this.navigate.to(this.privatePageUrl);
              } else {
                void this.collection.run();
              }
            }}
          ></btrix-collection-edit-dialog>`,
      )}
    `;
  }

  private renderActions() {
    const collection = this.collection.value;

    if (!collection) return;

    return html`<div class="-mb-3 flex justify-end gap-2">
      <btrix-popover placement="bottom">
        <div slot="content">
          <div class="text-sm font-semibold">
            ${SelectCollectionAccess.Options[collection.access].label}
          </div>
          <p>${SelectCollectionAccess.Options[collection.access].detail}</p>
        </div>
        <sl-button
          size="small"
          @click=${() => {
            this.showEditDialog = true;
          }}
        >
          <sl-icon
            slot="prefix"
            name=${SelectCollectionAccess.Options[collection.access].icon}
          ></sl-icon>
          ${msg("Share")}
        </sl-button>
      </btrix-popover>
      <sl-button
        variant="primary"
        size="small"
        href=${this.privatePageUrl}
        @click=${this.navigate.link}
      >
        <sl-icon slot="prefix" name="gear"></sl-icon>
        ${msg("Manage")}
      </sl-button>
    </div>`;
  }

  private readonly renderComplete = (collection: PublicCollection) => {
    const header: Parameters<typeof page>[0] = {
      breadcrumbs:
        collection.orgPublicProfile || collection.oid === this.orgId
          ? [
              {
                href: `/${RouteNamespace.PublicOrgs}/${this.orgSlug}`,
                content: collection.orgName,
              },
            ]
          : undefined,
      title: collection.name,
      content: html`<btrix-collection-page-header
          context="public"
          ?canEdit=${this.canEditCollection}
          collectionId=${collection.id}
          collectionName=${collection.name}
          slug=${collection.slug}
          caption=${collection.caption ?? ""}
          access=${collection.access}
          collectionSize=${collection.totalSize}
          homeUrl=${collection.homeUrl || ""}
          homeUrlTs=${collection.homeUrlTs || ""}
          thumbnailName=${collection.defaultThumbnailName || ""}
          thumbnailPath=${collection.thumbnail?.path || ""}
          pageCount=${collection.pageCount}
          ?allowPublicDownload=${collection.allowPublicDownload}
          @btrix-collection-saved=${(e: CollectionSavedEvent) => {
            e.stopPropagation();
            void this.collection.run();
          }}
        ></btrix-collection-page-header>
        <hr />`,
      aside: this.canEditCollection ? this.renderActions() : undefined,
    };

    const panel = (tab: PublicTab, content: TemplateResult) => html`
      <div
        class=${(this.tab as PublicTab) !== tab
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
            ${when(collection.crawlCount, () =>
              this.renderTab(PublicTab.Replay),
            )}
            ${this.renderTab(PublicTab.About)}
          </nav>

          ${when(collection.crawlCount, () =>
            panel(PublicTab.Replay, this.renderReplay(collection)),
          )}
          ${panel(PublicTab.About, this.renderAbout(collection))}
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

  private readonly renderTab = (tab: PublicTab) => {
    const isSelected = tab === (this.tab as PublicTab);

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
          hideOffscreen="true"
          deepLink
          @rwp-url-change=${(e: RwpUrlChangeEvent) => {
            if (!this.replayEmbed) {
              this.replayEmbed = e.currentTarget as ReplayWebPage;
            }
          }}
        ></replay-web-page>
      </section>
    `;
  }

  private renderAbout(collection: PublicCollection) {
    const metadata = metadataColumn(collection, { publicView: true });

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
              <h3>${msg("Details")}</h3>
            </btrix-section-heading>
            <div class="mt-5">${metadata}</div>
          </section>
        </div>
      `;
    }

    return html`<div class="rounded-lg border p-6">${metadata}</div>`;
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
