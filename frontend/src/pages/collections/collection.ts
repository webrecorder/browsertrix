import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { page } from "@/layouts/page";
import { RouteNamespace } from "@/routes";
import type { OrgProfileData, PublicCollection } from "@/types/org";

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

  readonly publicOrg = new Task(this, {
    task: async ([slug]) => {
      if (!slug) return;
      const org = await this.fetchOrgProfile(slug);
      return org;
    },
    args: () => [this.slug, this.collectionId] as const,
  });

  render() {
    return html`
      ${this.publicOrg.render({
        complete: (profile) =>
          profile ? this.renderCollection(profile) : nothing,
      })}
    `;
  }

  private renderCollection({ org, collections }: OrgProfileData) {
    const collection =
      this.collectionId &&
      collections.find(({ id }) => id === this.collectionId);

    if (!collection) {
      return "TODO";
    }

    return html`
      <btrix-document-title
        title="${collection.name} - ${org.name}"
      ></btrix-document-title>

      ${page(
        {
          title: collection.name,
        },
        () => html`
          <nav class="mb-3 flex gap-2">
            ${Object.values(Tab).map(this.renderTab)}
          </nav>

          ${choose(
            this.tab,
            [
              [Tab.Replay, () => this.renderReplay(collection)],
              [Tab.About, () => this.renderAbout(collection)],
            ],
            () => html`<btrix-not-found></btrix-not-found>`,
          )}
        `,
      )}
    `;
  }

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
    console.log(collection);

    return html`
      <div class="flex gap-6">
        <section class="flex-1">
          <h3 class="mb-3 text-base font-medium leading-none">
            ${msg("Description")}
          </h3>
          <div class="rounded-lg border p-5">
            ${collection.description ||
            html`<p class="text-center text-neutral-400">
              ${msg("A description has not been provided for this collection.")}
            </p>`}
          </div>
        </section>
        <section class="w-96 flex-shrink-0">
          <h3 class="mb-3 text-base font-medium leading-none">
            ${msg("Metadata")}
          </h3>
        </section>
      </div>
    `;
  }

  private async fetchOrgProfile(slug: string): Promise<OrgProfileData | void> {
    const resp = await fetch(`/api/public-collections/${slug}`, {
      headers: { "Content-Type": "application/json" },
    });

    switch (resp.status) {
      case 200:
        return (await resp.json()) as OrgProfileData;
      case 404: {
        throw resp.status;
      }
      default:
        throw resp.status;
    }
  }
}
