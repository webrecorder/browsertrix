import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlIcon, SlSelect } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import type { SelectSnapshotDetail } from "./select-collection-start-page";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";

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

  @property({ type: Boolean })
  open = false;

  @state()
  homeView = HomeView.Pages;

  @state()
  private showContent = false;

  @state()
  private isRwpLoaded = false;

  @query("replay-web-page")
  private readonly replayEmbed?: ReplayWebPage | null;

  @query("btrix-dialog")
  private readonly dialog?: Dialog | null;

  @query("form")
  private readonly form?: HTMLFormElement | null;

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
    return html`
      <div
        class="${this.homeView === HomeView.URL
          ? "flex items-center justify-center"
          : ""} relative aspect-video overflow-hidden rounded-lg border bg-slate-50"
      >
        ${when(
          this.homeView === HomeView.URL,
          () => html`
            <p class="m-3 text-pretty text-neutral-400">
              ${msg("Enter a URL to preview it")}
            </p>
          `,
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
                @btrix-select=${(e: CustomEvent<SelectSnapshotDetail>) => {
                  const { pageId, ts, url } = e.detail.item;

                  console.log(
                    `/replay/w/${pageId}/${ts.split(".")[0].replace(/\D/g, "")}id_/urn:thumbnail:${url}`,
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

  private onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    console.log("submit", serialize(form));
  }
}
