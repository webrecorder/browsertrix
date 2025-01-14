import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { formatRwpTimestamp } from "@/utils/replay";

@customElement("btrix-collection-snapshot-preview")
@localized()
export class CollectionSnapshotPreview extends TailwindElement {
  @property({ type: String })
  collectionId = "";

  @property({ type: String })
  timestamp = "";

  @property({ type: String })
  url = "";

  @query("iframe")
  private readonly iframe!: HTMLIFrameElement;

  public get src() {
    return this.iframe.src;
  }

  public get fetch() {
    return this.iframe.contentWindow!.fetch;
  }

  render() {
    return html`
      <sl-tooltip hoist>
        <iframe
          class="inline-block size-full"
          src=${`/replay/w/${this.collectionId}/${formatRwpTimestamp(this.timestamp)}id_/urn:thumbnail:${this.url}`}
        >
        </iframe>
        <span slot="content" class="break-all">${this.url}</span>
      </sl-tooltip>
    `;
  }
}
