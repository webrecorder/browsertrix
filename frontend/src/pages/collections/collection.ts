import { provide } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlChangeEvent, SlSwitch } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import type { ReplayWebPage, RwpUrlChangeEvent } from "replaywebpage";

import { collectionRwpContext } from "../org/collection-detail/context/collection-rwp";
import type { CollectionSavedEvent } from "../org/collection-detail/types";

import { BtrixElement } from "@/classes/BtrixElement";
import { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import { metadataColumn } from "@/layouts/collections/metadataColumn";
import { page } from "@/layouts/page";
import { CommonTab, OrgTab, RouteNamespace } from "@/routes";
import { CollectionAccess, type PublicCollection } from "@/types/collection";
import { formatRwpTimestamp } from "@/utils/replay";

import "@/features/collections/collection-page-header";

enum Tab {
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
  tab: Tab | string = Tab.Replay;

  @state()
  private viewAsCrawler?: boolean;

  @state()
  private showEditDialog = false;

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

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("appState.userInfo")) {
      this.setCrawlerView();
    }
  }

  protected firstUpdated(): void {
    this.setCrawlerView();
  }

  private setCrawlerView() {
    if (this.appState.userInfo && this.viewAsCrawler === undefined) {
      this.viewAsCrawler = this.canEditCollection;
    }
  }

  render() {
    return html`
      ${when(this.canEditCollection, this.renderPreviewBanner)}
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
                this.navigate.to(
                  `${this.navigate.orgBasePath}/${OrgTab.Collections}/${CommonTab.View}/${collection.id}`,
                );
              } else {
                void this.collection.run();
              }
            }}
          ></btrix-collection-edit-dialog>`,
      )}
    `;
  }

  private readonly renderPreviewBanner = () => {
    return html`
      <!-- TODO consolidate with btrix-org-status-banner -->
      <div class="border-b bg-slate-100 py-5">
        <div class="mx-auto box-border w-full max-w-screen-desktop px-3">
          <sl-alert variant="primary" open>
            <sl-icon slot="icon" name="eye-fill"></sl-icon>
            <div class="flex items-center justify-between gap-3">
              <div>
                <strong class="font-semibold">
                  ${msg("This is a shareable collection")}
                </strong>
                <p>${msg("You are viewing this page as an editor.")}</p>
              </div>
              <div>
                <sl-switch
                  size="small"
                  ?checked=${!this.viewAsCrawler}
                  @sl-change=${(e: SlChangeEvent) => {
                    const el = e.currentTarget as SlSwitch;
                    this.viewAsCrawler = !el.checked;
                  }}
                  >${msg("View as public")}</sl-switch
                >
              </div>
            </div>
          </sl-alert>
        </div>
      </div>
    `;
  };

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
          ?canEdit=${this.viewAsCrawler}
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
          >${this.renderActions()}</btrix-collection-page-header
        >
        <hr />`,
    };

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

  private renderActions() {
    return html`<btrix-popover slot="actions" placement="bottom">
      ${when(
        this.collection.value,
        (collection) => html`
          <div slot="content">
            <div class="text-sm font-semibold">
              ${SelectCollectionAccess.Options[collection.access].label}
            </div>
            <p>${SelectCollectionAccess.Options[collection.access].detail}</p>
          </div>
        `,
      )}
      <sl-button
        size="small"
        @click=${() => {
          this.showEditDialog = true;
        }}
      >
        <sl-icon
          slot="prefix"
          name=${this.collection.value
            ? SelectCollectionAccess.Options[this.collection.value.access].icon
            : ""}
        ></sl-icon>
        ${msg("Share")}
      </sl-button>
    </btrix-popover>`;
  }

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
