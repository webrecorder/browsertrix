import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlIcon, SlSelect } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import {
  HomeView,
  type CollectionSnapshotPreview,
} from "./collection-snapshot-preview";
import type { SelectSnapshotDetail } from "./select-collection-page";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { Collection } from "@/types/collection";

/**
 * @fires btrix-change
 */
@localized()
@customElement("btrix-collection-replay-dialog")
export class CollectionStartPageDialog extends BtrixElement {
  static readonly Options: Record<
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

  @property({ type: String })
  collectionId?: string;

  @property({ type: Object })
  collection?: Collection;

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
  private readonly thumbnailPreview?: CollectionSnapshotPreview | null;

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("collection") && this.collection) {
      this.homeView = this.collection.homeUrl ? HomeView.URL : HomeView.Pages;
    }
  }

  render() {
    const showTooltip =
      this.homeView === HomeView.URL && !this.selectedSnapshot;
    return html`
      <btrix-dialog
        .label=${msg("Set Initial View")}
        .open=${this.open}
        class="[--width:60rem]"
        @sl-show=${() => (this.showContent = true)}
        @sl-after-hide=${() => {
          if (this.collection) {
            this.homeView = this.collection.homeUrl
              ? HomeView.URL
              : HomeView.Pages;
          }

          this.isSubmitting = false;
          this.selectedSnapshot = null;
          this.showContent = false;
        }}
      >
        ${this.showContent ? this.renderContent() : nothing}
        <div slot="footer" class="flex items-center justify-between gap-3">
          <sl-button
            class="mr-auto"
            size="small"
            @click=${() => void this.dialog?.hide()}
            >${msg("Cancel")}</sl-button
          >
          <sl-tooltip
            content=${msg("Choose a page snapshot")}
            ?disabled=${!showTooltip}
          >
            <sl-button
              variant="primary"
              size="small"
              ?disabled=${!this.replayLoaded || showTooltip}
              ?loading=${this.isSubmitting}
              @click=${() => {
                this.form?.requestSubmit();
              }}
            >
              ${msg("Save")}
            </sl-button>
          </sl-tooltip>
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
    const snapshot =
      this.selectedSnapshot ||
      (this.collection?.homeUrl
        ? {
            url: this.collection.homeUrl,
            ts: this.collection.homeUrlTs,
            pageId: this.collection.homeUrlPageId,
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
    const { icon, detail } = CollectionStartPageDialog.Options[this.homeView];

    return html`
      <form @submit=${this.onSubmit}>
        <sl-select
          name="homeView"
          label=${msg("Initial View")}
          value=${this.homeView}
          hoist
          ?disabled=${!this.replayLoaded}
          @sl-change=${(e: SlChangeEvent) => {
            this.homeView = (e.currentTarget as SlSelect).value as HomeView;

            if (this.homeView === HomeView.Pages) {
              if (
                !this.collection?.homeUrlPageId ||
                this.collection.homeUrlPageId !== this.selectedSnapshot?.pageId
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
              <btrix-select-collection-page
                .collectionId=${this.collectionId}
                .collection=${this.collection}
                @btrix-select=${async (
                  e: CustomEvent<SelectSnapshotDetail>,
                ) => {
                  this.selectedSnapshot = e.detail.item;
                }}
              ></btrix-select-collection-page>

              <sl-checkbox
                name="useThumbnail"
                class="mt-3 part-[form-control-help-text]:text-balance"
                checked
                help-text=${msg(
                  "If this collection is public, the preview will be used as the thumbnail for this collection.",
                )}
              >
                ${msg("Update collection thumbnail")}
              </sl-checkbox>
            </section>
          `,
        )}
      </form>
    `;
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    const { homeView, useThumbnail } = serialize(form);

    if (
      (homeView === HomeView.Pages && !this.collection?.homeUrlPageId) ||
      (homeView === HomeView.URL &&
        this.selectedSnapshot &&
        this.collection?.homeUrlPageId === this.selectedSnapshot.pageId)
    ) {
      // No changes to save
      this.open = false;
      return;
    }

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
        this.collection?.thumbnailSource?.urlPageId !==
          this.selectedSnapshot.pageId;
      // TODO get filename from rwp?
      const fileName = `page-thumbnail_${this.selectedSnapshot?.pageId}.jpeg`;
      let file: File | undefined;

      if (shouldUpload && this.thumbnailPreview) {
        const blob = await this.thumbnailPreview.thumbnailBlob;

        if (blob) {
          file = new File([blob], fileName, {
            type: blob.type,
          });
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
          if (!file || !fileName || !this.selectedSnapshot)
            throw new Error("file or fileName missing");
          const searchParams = new URLSearchParams({
            filename: fileName,
            sourceUrl: this.selectedSnapshot.url,
            sourceTs: this.selectedSnapshot.ts,
            sourcePageId: this.selectedSnapshot.pageId,
          });
          const tasks = [
            this.api.upload(
              `/orgs/${this.orgId}/collections/${this.collectionId}/thumbnail?${searchParams.toString()}`,
              file,
            ),
            this.updateThumbnail({ defaultThumbnailName: null }),
          ];
          await Promise.all(tasks);

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

      this.dispatchEvent(new CustomEvent("btrix-change"));
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
