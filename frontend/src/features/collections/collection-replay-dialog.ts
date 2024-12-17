import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlIcon, SlSelect } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { SelectSnapshotDetail } from "./select-collection-start-page";

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

  @property({ type: String })
  homeUrl?: string | null = null;

  @property({ type: String })
  homePageId?: string | null = null;

  @property({ type: String })
  homeTs?: string | null = null;

  @property({ type: Boolean })
  open = false;

  @property({ type: Boolean })
  replayLoaded = false;

  @state()
  homeView = HomeView.Pages;

  @state()
  private showContent = false;

  @state()
  private isSubmitting = false;

  @state()
  private selectedSnapshot?: SelectSnapshotDetail["item"];

  @query("btrix-dialog")
  private readonly dialog?: Dialog | null;

  @query("form")
  private readonly form?: HTMLFormElement | null;

  @query("#thumbnailPreview")
  private readonly thumbnailPreview?: HTMLIFrameElement | null;

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("homeUrl") && this.homeUrl) {
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
            ?disabled=${!this.replayLoaded}
            ?loading=${this.isSubmitting}
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
      <p class="m-3 text-pretty text-neutral-500">
        ${msg("Enter a Page URL to preview it")}
      </p>
    `;
    const snapshot =
      this.selectedSnapshot ||
      (this.homeUrl
        ? {
            url: this.homeUrl,
            ts: this.homeTs,
            pageId: this.homePageId,
          }
        : null);

    if (snapshot) {
      console.log(this.selectedSnapshot);
      urlPreview = html`
        <iframe
          class="inline-block size-full"
          id="thumbnailPreview"
          src=${`/replay/w/${this.collectionId}/${formatRwpTimestamp(snapshot.ts)}id_/urn:thumbnail:${snapshot.url}`}
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
          this.homeView === HomeView.URL && this.replayLoaded,
          () => urlPreview,
        )}
        <div class="${this.homeView === HomeView.URL ? "offscreen" : ""}">
          ${this.renderReplay()}
        </div>

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
    const { icon, detail } = CollectionStartPageDialog.Options[this.homeView];

    return html`
      <form @submit=${this.onSubmit}>
        <sl-select
          name="homeView"
          label=${msg("Select View")}
          value=${this.homeView}
          hoist
          ?disabled=${!this.replayLoaded}
          @sl-change=${(e: SlChangeEvent) => {
            this.homeView = (e.currentTarget as SlSelect).value as HomeView;
          }}
        >
          ${this.replayLoaded
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
                .homeUrl=${this.homeUrl}
                .homeTs=${this.homeTs}
                @btrix-select=${async (
                  e: CustomEvent<SelectSnapshotDetail>,
                ) => {
                  this.selectedSnapshot = e.detail.item;
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
    // TODO Get query from replay-web-page embed
    const query = queryString.stringify({
      source: replaySource,
      customColl: this.collectionId,
      embed: "default",
      noCache: 1,
      noSandbox: 1,
    });

    return html`<div class="aspect-video w-[200%]">
      <div class="pointer-events-none aspect-video origin-top-left scale-50">
        <iframe
          class="inline-block size-full"
          src=${`/replay/?${query}#view=pages`}
        ></iframe>
      </div>
    </div>`;
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    const { homeView, useThumbnail } = serialize(form);

    this.isSubmitting = true;

    try {
      await this.updateUrl({
        pageId:
          (homeView === HomeView.URL && this.selectedSnapshot?.pageId) || null,
      });

      const shouldUpload =
        homeView === HomeView.URL &&
        useThumbnail === "on" &&
        this.selectedSnapshot &&
        this.homePageId !== this.selectedSnapshot.pageId;
      // TODO get filename from rwp?
      const fileName = `page-thumbnail_${this.selectedSnapshot?.pageId}.jpeg`;
      let file: File | undefined;

      if (shouldUpload && this.thumbnailPreview?.src) {
        const { src } = this.thumbnailPreview;

        // Wait to get the thumbnail image before closing the dialog
        try {
          const resp = await this.thumbnailPreview.contentWindow!.fetch(src);
          const blob = await resp.blob();

          file = new File([blob], fileName, {
            type: blob.type,
          });
        } catch (err) {
          console.debug(err);
        }
      } else {
        this.notify.toast({
          message: msg("Home view updated."),
          variant: "success",
          icon: "check2-circle",
          id: "home-view-update-status",
        });
      }

      this.isSubmitting = false;
      this.open = false;

      if (shouldUpload) {
        try {
          if (!file || !fileName) throw new Error("file or fileName missing");
          await this.api.upload(
            `/orgs/${this.orgId}/collections/${this.collectionId}/thumbnail?filename=${fileName}`,
            file,
          );
          await this.updateThumbnail({ defaultThumbnailName: null });

          this.notify.toast({
            message: msg("Home view and collection thumbnail updated."),
            variant: "success",
            icon: "check2-circle",
            id: "home-view-update-status",
          });
        } catch (err) {
          console.debug(err);

          this.notify.toast({
            message: msg(
              "Home view updated, but couldn't update collection thumbnail at this time.",
            ),
            variant: "warning",
            icon: "exclamation-triangle",
            id: "home-view-update-status",
          });
        }
      }
    } catch (err) {
      console.debug(err);

      this.isSubmitting = false;

      this.notify.toast({
        message: msg("Sorry, couldn't update home view at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "home-view-update-status",
      });
    }
  }

  private async updateThumbnail({
    defaultThumbnailName,
  }: {
    defaultThumbnailName: string | null;
  }) {
    return this.api.fetch<{ updated: boolean }>(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ defaultThumbnailName }),
      },
    );
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
