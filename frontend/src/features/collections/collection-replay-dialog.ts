import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlIcon, SlSelect } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import type {
  SelectCollectionStartPage,
  SelectSnapshotDetail,
} from "./select-collection-start-page";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { formatRwpTimestamp } from "@/utils/replay";

enum HomeView {
  Pages = "pages",
  URL = "url",
}

@localized()
@customElement("btrix-collection-replay-dialog")
export class CollectionStartPageDialog extends BtrixElement {
  static readonly Options: Record<
    HomeView,
    { label: string; icon: NonNullable<SlIcon["name"]>; detail: string }
  > = {
    [HomeView.Pages]: {
      label: msg("Default"),
      icon: "list-ul",
      detail: `${msg("ReplayWeb.Page default view")}`,
    },
    [HomeView.URL]: {
      label: msg("Page"),
      icon: "file-earmark",
      detail: msg("Load a single page URL"),
    },
  };

  @property({ type: String })
  collectionId?: string;

  @property({ type: Object })
  home?: {
    url: string | null;
    pageId: string | null;
    ts: string | null;
  };

  @property({ type: Boolean })
  open = false;

  @state()
  homeView = HomeView.Pages;

  @state()
  private showContent = false;

  @state()
  private isRwpLoaded = false;

  @query("btrix-select-collection-start-page")
  private readonly selectCollectionStartPage?: SelectCollectionStartPage | null;

  @query("replay-web-page")
  private readonly replayEmbed?: ReplayWebPage | null;

  @query("btrix-dialog")
  private readonly dialog?: Dialog | null;

  @query("form")
  private readonly form?: HTMLFormElement | null;

  @query("#thumbnailPreview")
  private readonly thumbnailPreview?: HTMLIFrameElement | null;

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("home") && this.home?.url) {
      this.homeView = HomeView.URL;
    }
  }

  render() {
    return html`
      <btrix-dialog
        .label=${msg("Configure Replay Home")}
        .open=${this.open}
        class="[--width:60rem]"
        @sl-show=${() => (this.showContent = true)}
        @sl-after-hide=${() => (this.showContent = false)}
      >
        ${this.showContent ? this.renderContent() : nothing}
        <div slot="footer" class="flex items-center justify-between gap-3">
          <sl-button
            class="mr-auto"
            size="small"
            @click=${() => void this.dialog?.hide()}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            variant="primary"
            size="small"
            ?disabled=${!this.isRwpLoaded}
            @click=${() => {
              this.form?.requestSubmit();
            }}
          >
            ${msg("Save")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private renderContent() {
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
    let urlPreview = html`
      <p class="m-3 text-pretty text-neutral-400">
        ${msg("Enter a URL to preview it")}
      </p>
    `;
    if (this.home) {
      urlPreview = html`
        <iframe
          class="inline-block size-full"
          id="thumbnailPreview"
          src=${`/replay/w/${this.collectionId}/${formatRwpTimestamp(this.home.ts)}id_/urn:thumbnail:${this.home.url}`}
        >
        </iframe>
      `;
    }

    return html`
      <div
        class="${this.homeView === HomeView.URL
          ? "flex items-center justify-center"
          : ""} relative aspect-video overflow-hidden rounded-lg border bg-slate-50"
      >
        ${when(
          this.homeView === HomeView.URL && this.isRwpLoaded,
          () => urlPreview,
        )}
        <div class="${this.homeView === HomeView.URL ? "offscreen" : ""}">
          ${this.renderReplay()}
        </div>

        ${when(
          !this.isRwpLoaded,
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
    const { icon, detail } = CollectionStartPageDialog.Options[this.homeView];

    return html`
      <form @submit=${this.onSubmit}>
        <sl-select
          name="homeView"
          label=${msg("Select View")}
          value=${this.homeView}
          hoist
          ?disabled=${!this.isRwpLoaded}
          @sl-change=${(e: SlChangeEvent) => {
            this.homeView = (e.currentTarget as SlSelect).value as HomeView;
          }}
        >
          ${this.isRwpLoaded
            ? html`<sl-icon slot="prefix" name=${icon}></sl-icon>`
            : html`<sl-spinner slot="prefix"></sl-spinner>`}

          <span slot="suffix" class="whitespace-nowrap text-neutral-500"
            >${detail}</span
          >

          ${Object.values(HomeView).map((homeView) => {
            const { label, icon, detail } =
              CollectionStartPageDialog.Options[homeView];
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
                .homeUrl=${this.home?.url}
                .homeTs=${this.home?.ts}
                @btrix-select=${(e: CustomEvent<SelectSnapshotDetail>) => {
                  const { ts, url } = e.detail.item;

                  this.thumbnailPreview?.setAttribute(
                    "src",
                    `/replay/w/${this.collectionId}/${formatRwpTimestamp(ts)}id_/urn:thumbnail:${url}`,
                  );
                }}
              ></btrix-select-collection-start-page>

              <sl-checkbox name="useThumbnail" class="mt-3" checked>
                ${msg("Update collection thumbnail")}
                <sl-tooltip
                  content=${msg(
                    "If this collection is public, the preview will be used as the thumbnail for this collection.",
                  )}
                >
                  <sl-icon
                    name="info-circle"
                    class="[vertical-align:-.175em]"
                  ></sl-icon>
                </sl-tooltip>
              </sl-checkbox>
            </section>
          `,
        )}
      </form>
    `;
  }

  private renderReplay() {
    const replaySource = `/api/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return html`<div class="aspect-video w-[200%]">
      <div class="pointer-events-none aspect-video origin-top-left scale-50">
        <replay-web-page
          source=${replaySource}
          replayBase="/replay/"
          config="${config}"
          coll=${this.collectionId!}
          noSandbox="true"
          noCache="true"
          @rwp-url-change=${() => {
            if (!this.isRwpLoaded) {
              // First load
              this.isRwpLoaded = true;
            }
          }}
        ></replay-web-page>
      </div>
    </div>`;
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    const { homeView, useThumbnail } = serialize(form);

    try {
      await this.updateUrl({
        pageId:
          (homeView === HomeView.URL &&
            this.selectCollectionStartPage?.snapshot?.pageId) ||
          null,
      });

      if (homeView === HomeView.URL) {
        console.log(useThumbnail);
        // TODO upload thumbnail
      }

      this.notify.toast({
        message: msg("Replay home view updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn't update home view at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async updateUrl({ pageId }: { pageId: string | null }) {
    return this.api.fetch(
      `/orgs/${this.orgId}/collections/${this.collectionId}/home-url`,
      {
        method: "POST",
        body: JSON.stringify({
          pageId,
        }),
      },
    );
  }
}
