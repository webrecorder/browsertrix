import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { msg, localized } from "@lit/localize";

type Page = {
  // Page URL
  url: string;
  // PNG dataURI
  data: string;
};

type Message = {
  id: string; // page ID
};

type ScreencastMessage = Message & {
  msg: "screencast";
  url: string; // page URL
  data: string; // base64 PNG data
};

type CloseMessage = Message & {
  msg: "close";
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
  @property({ type: String })
  authToken?: string;

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
    super.connectedCallback();

    if (this.archiveId && this.crawlId && this.authToken) {
      this.connectWs();
    }
  }

  async updated(changedProperties: any) {
    if (
      changedProperties.get("archiveId") ||
      changedProperties.get("crawlId") ||
      changedProperties.get("authToken")
    ) {
      // Reconnect
      this.disconnectWs();
      this.connectWs();
    }
  }

  disconnectedCallback() {
    this.disconnectWs();
    super.disconnectedCallback();
  }

  render() {
    return html` ${Object.values(this.pages).map(this.renderPage)} `;
  }

  private connectWs() {
    console.log("open");
    if (!this.archiveId || !this.crawlId) return;

    this.ws = new WebSocket(
      `${window.location.protocol === "https:" ? "wss" : "ws"}:${
        process.env.API_HOST
      }/api/archives/${this.archiveId}/crawls/${
        this.crawlId
      }/watch/ws?auth_bearer=${this.authToken || ""}`
    );

    // this.ws.addEventListener("open", console.debug);
    // this.ws.addEventListener("close", console.debug);
    // this.ws.addEventListener("error", console.error);
    this.ws.addEventListener("message", ({ data }) => this.handleMessage(data));
  }

  private disconnectWs() {
    console.log("close");
    if (this.ws) {
      this.ws.close();
    }

    this.ws = null;
  }

  private handleMessage(data: string) {
    const message: ScreencastMessage | CloseMessage = JSON.parse(data);

    console.log(message);
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
