import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import type { SelectSnapshotDetail } from "./select-collection-start-page";

import { TailwindElement } from "@/classes/TailwindElement";
import { formatRwpTimestamp } from "@/utils/replay";
import { tw } from "@/utils/tailwind";

export enum HomeView {
  Pages = "pages",
  URL = "url",
}

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

  @property({ type: Object })
  snapshot?: Partial<SelectSnapshotDetail["item"]>;

  @query("iframe")
  private readonly iframe?: HTMLIFrameElement | null;

  @state()
  private iframeLoaded = false;

  public get thumbnailBlob() {
    return this.blobTask.taskComplete.finally(() => this.blobTask.value);
  }

  private readonly blobTask = new Task(this, {
    task: async ([collectionId, snapshot, iframeLoaded]) => {
      if (
        !collectionId ||
        !snapshot ||
        !iframeLoaded ||
        !this.iframe?.contentWindow
      ) {
        return;
      }

      const resp = await this.iframe.contentWindow.fetch(
        `/replay/w/${this.collectionId}/${formatRwpTimestamp(snapshot.ts)}id_/urn:thumbnail:${snapshot.url}`,
      );

      if (resp.status === 200) {
        return await resp.blob();
      }

      throw new Error(`couldn't get thumbnail`);
    },
    args: () => [this.collectionId, this.snapshot, this.iframeLoaded] as const,
  });

  private readonly objectUrlTask = new Task(this, {
    task: ([blob]) => {
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
      if (this.objectUrlTask.value) {
        URL.revokeObjectURL(this.objectUrlTask.value);
      }
    }
  }

  render() {
    return html` ${this.renderSnapshot()} ${this.renderReplay()} `;
  }

  private renderSnapshot() {
    if (this.view === HomeView.Pages) return;

    return this.blobTask.render({
      complete: this.renderImage,
      pending: this.renderSpinner,
      error: this.renderError,
    });
  }

  private readonly renderImage = () => {
    if (!this.snapshot) {
      return html`
        <p class="m-3 text-pretty text-neutral-500">
          ${msg("Enter a Page URL to preview it")}
        </p>
      `;
    }

    return html`
      <div class="size-full">
        <sl-tooltip hoist>
          ${this.objectUrlTask.render({
            complete: (value) =>
              value
                ? html`<img class="size-full" src=${value} />`
                : this.renderSpinner(),
            pending: () => "pending",
          })}
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
            }}
          ></iframe>
        </div>
      </div>
    </div>`;
  }

  private readonly renderError = () => html`
    <p class="m-3 text-pretty text-danger">
      ${msg("Couldn't load preview. Try another snapshot")}
    </p>
  `;

  private readonly renderSpinner = () => html`
    <div class="flex size-full items-center justify-center text-2xl">
      <sl-spinner></sl-spinner>
    </div>
  `;
}
