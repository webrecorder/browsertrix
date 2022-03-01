import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";

type Message = {
  id: string; // page ID
};

type InitMessage = Message & {
  msg: "init";
  browsers: number;
  width: number;
  height: number;
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
 * <btrix-screencast
 *   archiveId=${archiveId}
 *   crawlId=${crawlId}
 * ></btrix-screencast>
 * ```
 */
export class Screencast extends LitElement {
  static styles = css`
    .wrapper {
      position: relative;
    }

    .spinner {
      text-align: center;
      font-size: 2rem;
    }

    .container {
      display: grid;
      gap: 0.5rem;
    }

    figure {
      margin: 0;
      border: 1px solid var(--sl-color-neutral-100);
      border-radius: var(--sl-border-radius-medium);
    }

    figcaption {
      border-bottom-width: 1px;
      border-bottom-color: var(--sl-panel-border-color);
      color: var(--sl-color-neutral-600);
      font-size: var(--sl-font-size-small);
      line-height: 1;
      padding: var(--sl-spacing-x-small);
    }

    img {
      display: block;
      width: 100%;
      height: auto;
      box-shadow: 0;
      outline: 0;
      border: 0;
    }
  `;

  @property({ type: String })
  authToken?: string;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ type: Array })
  watchIPs: string[] = [];

  @state()
  private dataList: Array<ScreencastMessage> = [];

  @state()
  private isConnecting: boolean = false;

  // Websocket connections
  private wsMap: Map<string, WebSocket> = new Map();

  // Page image data
  private imageDataMap: Map<string, ScreencastMessage> = new Map();

  private screenCount = 1;

  shouldUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.size === 1 && changedProperties.has("watchIPs")) {
      // Check stringified value of IP list
      return (
        this.watchIPs.toString() !==
        changedProperties.get("watchIPs").toString()
      );
    }

    return true;
  }

  protected firstUpdated() {
    this.isConnecting = true;

    // Connect to websocket server
    this.connectWs();
  }

  async updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.get("archiveId") ||
      changedProperties.get("crawlId") ||
      changedProperties.get("watchIPs") ||
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
    return html`
      <div class="wrapper">
        ${this.isConnecting
          ? html`<div class="spinner">
              <sl-spinner></sl-spinner>
            </div> `
          : ""}
        <div
          class="container"
          style="grid-template-columns: repeat(${this.screenCount}, 1fr) "
        >
          ${this.dataList.map(
            ({ url, data }) => html` <figure>
              <figcaption>${url}</figcaption>
              <img src="data:image/png;base64,${data}" title="${url}" />
            </figure>`
          )}
        </div>
      </div>
    `;
  }

  private connectWs() {
    if (!this.archiveId || !this.crawlId) {
      return;
    }

    if (!this.watchIPs?.length) {
      console.warn("No watch IPs to connect to");
      return;
    }

    this.watchIPs.forEach((ip: string) => {
      const ws = new WebSocket(
        `${window.location.protocol === "https:" ? "wss" : "ws"}:${
          process.env.API_HOST
        }/watch/${this.archiveId}/${this.crawlId}/${ip}/ws?auth_bearer=${
          this.authToken || ""
        }`
      );

      ws.addEventListener("open", () => {
        if (this.wsMap.size === this.watchIPs.length) {
          this.isConnecting = false;
        }
      });
      ws.addEventListener("close", () => {
        this.wsMap.delete(ip);
      });
      ws.addEventListener("error", () => {
        this.isConnecting = false;
      });
      ws.addEventListener("message", ({ data }) => {
        this.handleMessage(JSON.parse(data));
      });

      this.wsMap.set(ip, ws);
    });
  }

  private disconnectWs() {
    this.isConnecting = false;

    this.wsMap.forEach((ws) => {
      ws.close();
    });
  }

  private handleMessage(
    message: InitMessage | ScreencastMessage | CloseMessage
  ) {
    if (message.msg === "init") {
      this.screenCount = message.browsers;
    } else {
      const { id } = message;

      if (message.msg === "screencast") {
        if (message.url === "about:blank") {
          // Skip blank pages
          return;
        }

        if (this.isConnecting) {
          this.isConnecting = false;
        }

        this.imageDataMap.set(id, message);
      } else if (message.msg === "close") {
        this.imageDataMap.delete(id);
      }

      // keep same number of data entries (probably should only decrease if scale is reduced)
      this.dataList = [
        ...this.imageDataMap.values(),
        ...this.dataList.slice(this.imageDataMap.size),
      ];
    }
  }
}
