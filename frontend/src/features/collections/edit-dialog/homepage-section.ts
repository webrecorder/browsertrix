import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlIcon, SlSelect } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import {
  HomeView,
  type CollectionSnapshotPreview,
} from "../collection-snapshot-preview";
import type { SelectSnapshotDetail } from "../select-collection-start-page";

import { BtrixElement } from "@/classes/BtrixElement";

const OPTIONS: Record<
  HomeView,
  { label: string; icon: NonNullable<SlIcon["name"]>; detail: string }
> = {
  [HomeView.Pages]: {
    label: msg("List of Pages"),
    icon: "list-ul",
    detail: `${msg("ReplayWeb.Page default view")}`,
  },
  [HomeView.URL]: {
    label: msg("Start Page"),
    icon: "file-earmark-richtext",
    detail: msg("Show a single URL snapshot"),
  },
};

@customElement("btrix-collection-homepage-settings")
@localized()
export class CollectionHomepageSettings extends BtrixElement {
  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  homeUrl?: string | null = null;

  @property({ type: String })
  homePageId?: string | null = null;

  @property({ type: String })
  homeTs?: string | null = null;

  @property({ type: Boolean })
  replayLoaded = false;

  @state()
  homeView = HomeView.Pages;

  useThumbnail = true;

  @state()
  selectedSnapshot?: SelectSnapshotDetail["item"];

  @query("#thumbnailPreview")
  public readonly thumbnailPreview?: CollectionSnapshotPreview | null;

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("homeUrl")) {
      this.homeView = this.homeUrl ? HomeView.URL : HomeView.Pages;
    }
  }

  render() {
    return html`
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div class="col-span-1">
          <h3 class="form-label">${msg("Preview")}</h3>
          ${this.renderPreview()}
        </div>
        <div class="col-span-1">${this.renderForm()}</div>
      </div>
    `;
  }

  private renderPreview() {
    const snapshot =
      this.selectedSnapshot ||
      (this.homeUrl
        ? {
            url: this.homeUrl,
            ts: this.homeTs!,
            pageId: this.homePageId!,
            status: 200,
          }
        : null);

    const replaySource = `/api/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`;
    // TODO Get query from replay-web-page embed
    const query = queryString.stringify({
      source: replaySource,
      customColl: this.collectionId,
      embed: "default",
      noCache: 1,
      noSandbox: 1,
    });

    return html`
      <div
        class="${this.homeView === HomeView.URL
          ? "flex items-center justify-center"
          : ""} relative aspect-video overflow-hidden rounded-lg border bg-slate-50"
      >
        <btrix-collection-snapshot-preview
          class="contents"
          id="thumbnailPreview"
          collectionId=${this.collectionId || ""}
          view=${this.homeView}
          replaySrc=${`/replay/?${query}#view=pages`}
          .snapshot=${snapshot}
        >
        </btrix-collection-snapshot-preview>

        ${when(
          !this.replayLoaded,
          () => html`
            <div
              class="absolute inset-0 flex items-center justify-center text-2xl"
            >
              <sl-spinner></sl-spinner>
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderForm() {
    const { icon, detail } = OPTIONS[this.homeView];

    return html`
      <sl-select
        name="homeView"
        label=${msg("Select Initial View")}
        value=${this.homeView}
        hoist
        ?disabled=${!this.replayLoaded}
        @sl-change=${(e: SlChangeEvent) => {
          this.homeView = (e.currentTarget as SlSelect).value as HomeView;

          if (this.homeView === HomeView.Pages) {
            if (
              !this.homePageId ||
              this.homePageId !== this.selectedSnapshot?.pageId
            ) {
              // Reset unsaved selected snapshot
              this.selectedSnapshot = null;
            }
          }
        }}
      >
        ${this.replayLoaded
          ? html`<sl-icon slot="prefix" name=${icon}></sl-icon>`
          : html`<sl-spinner slot="prefix"></sl-spinner>`}

        <span slot="suffix" class="whitespace-nowrap text-neutral-500"
          >${detail}</span
        >

        ${Object.values(HomeView).map((homeView) => {
          const { label, icon, detail } = OPTIONS[homeView];
          return html`
            <sl-option value=${homeView}>
              <sl-icon slot="prefix" name=${icon}></sl-icon>
              ${label}
              <span slot="suffix">${detail}</span>
            </sl-option>
          `;
        })}
      </sl-select>

      ${when(
        this.homeView === HomeView.URL,
        () => html`
          <sl-divider></sl-divider>
          <section>
            <btrix-select-collection-start-page
              .collectionId=${this.collectionId}
              .homeUrl=${this.homeUrl}
              .homeTs=${this.homeTs}
              @btrix-select=${async (e: CustomEvent<SelectSnapshotDetail>) => {
                this.selectedSnapshot = e.detail.item;
                this.dispatchEvent(
                  new CustomEvent("btrix-change", {
                    bubbles: true,
                  }),
                );
              }}
            ></btrix-select-collection-start-page>
          </section>
        `,
      )}
    `;
  }
}
