import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { msg, localized } from "@lit/localize";

import type { Auth } from "../utils/AuthService";

type Page = {
  // Page URL
  url: string;
  // PNG dataURI
  data: string;
};

/**
 * Watch page crawl
 *
 * Usage example:
 * ```ts
 * <btrix-watch-crawl
 *   archiveId=${archiveId}
 *   crawlId=${crawlId}
 * ></btrix-watch-crawl>
 * ```
 */
@localized()
export class WatchCrawl extends LitElement {
  @property({ type: Object })
  authHeaders?: Auth["headers"];

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @state()
  private pages: {
    [pageId: string]: Page;
  } = {};

  // Websocket connection
  private ws: WebSocket | null = null;

  connectedCallback() {
    if (this.archiveId && this.crawlId) {
      super.connectedCallback();

      // TODO auth
      this.ws = new WebSocket(
        `${window.location.protocol === "https" ? "wss" : "ws"}:${
          process.env.API_HOST
        }/api/archives/${this.archiveId}/crawls/${this.crawlId}/watch/ws`
      );
    } else {
      console.error("<btrix-watch-crawl> archiveId and crawlId is required");
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  render() {
    return html` ${Object.values(this.pages).map(this.renderPage)} `;
  }

  private renderPage(page: Page) {
    return html`
      <figure
        class="aspect-4/3 rounded border"
        aria-label=${msg("Stream of page ${page.url}")}
      ></figure>
    `;
  }
}
