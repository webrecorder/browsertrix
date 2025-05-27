import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import clsx from "clsx";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { isEqual } from "lodash";

import type { SelectSnapshotDetail } from "./select-collection-page";

import { TailwindElement } from "@/classes/TailwindElement";
import { formatRwpTimestamp } from "@/utils/replay";
import { tw } from "@/utils/tailwind";

export enum HomeView {
  Pages = "pages",
  URL = "url",
}

export type BtrixValidateDetail = {
  valid: boolean;
};

/**
 * Display preview of page snapshot.
 *
 * A previously loaded `replay-web-page` embed is required in order for preview to work.
 */
@customElement("btrix-collection-snapshot-preview")
@localized()
export class CollectionSnapshotPreview extends TailwindElement {
  @property({ type: String })
  collectionId = "";

  @property({ type: String })
  replaySrc = "";

  @property({ type: String })
  view?: HomeView;

  @property({ type: Boolean })
  noSpinner = false;

  @property({
    type: Object,
    hasChanged: (a, b) => !isEqual(a, b),
  })
  snapshot?: Partial<SelectSnapshotDetail["item"]>;

  @query("iframe")
  private readonly iframe?: HTMLIFrameElement | null;

  @query("img#preview")
  private readonly previewImg?: HTMLImageElement | null;

  @state()
  private iframeLoaded = false;

  // Set up a promise and a helper callback so that we can wait until the iframe is loaded, rather than returning nothing when it's not yet loaded
  private iframeLoadComplete!: () => void;
  private readonly iframeLoadedPromise = new Promise<void>((res) => {
    if (this.iframeLoaded) res();
    this.iframeLoadComplete = res;
  });

  public get thumbnailBlob() {
    return this.blobTask.taskComplete.then(() => this.blobTask.value);
  }

  public readonly blobTask = new Task(this, {
    task: async ([collectionId, snapshot], { signal }) => {
      try {
        console.debug("waiting for iframe to load", { collectionId, snapshot });
        await this.iframeLoadedPromise;
        if (
          !collectionId ||
          !snapshot?.ts ||
          !snapshot.url ||
          !this.iframe?.contentWindow
        ) {
          console.debug(
            "exiting early due to missing props",
            collectionId,
            snapshot,
            this.iframe?.contentWindow,
          );
          return;
        }

        const resp = await this.iframe.contentWindow.fetch(
          `/replay/w/${this.collectionId}/${formatRwpTimestamp(snapshot.ts)}id_/urn:thumbnail:${snapshot.url}`,
          { signal },
        );

        if (resp.status === 200) {
          this.dispatchEvent(
            new CustomEvent<BtrixValidateDetail>("btrix-validate", {
              detail: { valid: true },
            }),
          );
          return await resp.blob();
        }

        throw new Error(`couldn't get thumbnail`);
      } catch (e) {
        console.error(e);
        if (signal.aborted) return;
        this.dispatchEvent(
          new CustomEvent<BtrixValidateDetail>("btrix-validate", {
            detail: { valid: false },
          }),
        );
        throw e;
      }
    },
    args: () => [this.collectionId, this.snapshot] as const,
  });

  @state()
  private prevObjUrl?: string;

  private readonly objectUrlTask = new Task(this, {
    task: ([blob]) => {
      this.prevObjUrl = this.objectUrlTask.value;
      if (!blob) return "";

      const url = URL.createObjectURL(blob);

      if (url) return url;

      throw new Error("no object url");
    },
    args: () => [this.blobTask.value] as const,
  });

  disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this.objectUrlTask.value) {
      URL.revokeObjectURL(this.objectUrlTask.value);
    }
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("collectionId") ||
      changedProperties.has("snapshot")
    ) {
      // revoke object urls once the `<img>` element has loaded the next url, to
      // prevent flashes

      this.previewImg?.addEventListener("load", () => {
        if (this.prevObjUrl) {
          URL.revokeObjectURL(this.prevObjUrl);
          this.prevObjUrl = undefined;
        }
      });
    }
  }

  render() {
    return html` ${this.renderSnapshot()} ${this.renderReplay()} `;
  }

  private renderSnapshot() {
    if (this.view === HomeView.Pages) return;

    return this.blobTask.render({
      complete: this.renderImage,
      pending: this.renderImage,
      error: this.renderError,
    });
  }

  private readonly renderImage = () => {
    if (!this.snapshot) {
      if (this.noSpinner) return;
      return html`
        <p
          class="absolute inset-0 my-auto grid place-content-center text-balance p-3 text-neutral-500"
        >
          <slot name="placeholder">
            ${msg("Enter a Page URL to preview it.")}
          </slot>
        </p>
      `;
    }

    return html`
      <div class="size-full">
        <sl-tooltip hoist>
          ${this.objectUrlTask.value ? nothing : this.renderSpinner()}
          <div class="absolute size-full">
            ${this.prevObjUrl
              ? html`<img
                  class="absolute inset-0 size-full"
                  role="presentation"
                  src=${this.prevObjUrl}
                />`
              : nothing}
            ${this.objectUrlTask.value
              ? html`<img
                  class="absolute inset-0 size-full"
                  id="preview"
                  src=${this.objectUrlTask.value}
                />`
              : nothing}
          </div>
          <span slot="content" class="break-all">${this.snapshot.url}</span>
        </sl-tooltip>
      </div>
    `;
  };

  private renderReplay() {
    return html`<div
      class=${clsx(tw`size-full`, this.view === HomeView.URL && tw`offscreen`)}
    >
      <div class="aspect-video w-[200%]">
        <div class="pointer-events-none aspect-video origin-top-left scale-50">
          <iframe
            class="inline-block size-full"
            src=${this.replaySrc}
            @load=${() => {
              this.iframeLoaded = true;
              this.iframeLoadComplete();
              console.debug("iframe loaded");
            }}
          ></iframe>
        </div>
      </div>
    </div>`;
  }

  private readonly renderError = () => html`
    <p
      class="absolute inset-0 z-20 my-auto grid place-content-center text-balance bg-neutral-50 p-3 text-xs text-neutral-500"
    >
      ${msg("This page doesn’t have a preview. Try another URL or timestamp.")}
    </p>
  `;

  private readonly renderSpinner = () => {
    if (this.noSpinner) return;
    return html`
      <div class="flex size-full items-center justify-center text-2xl">
        <sl-spinner></sl-spinner>
      </div>
    `;
  };
}
