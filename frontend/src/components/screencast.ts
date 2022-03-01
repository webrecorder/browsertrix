import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";

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

// TODO don't hardcode
const SCREEN_WIDTH = 573;
const SCREEN_HEIGHT = 480;

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
      border-radius: var(--sl-border-radius-large);
    }

    .wrapper.loading {
      background-color: var(--sl-color-neutral-50);
    }

    sl-spinner {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 2rem;
    }

    .container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(calc(33.33% - 1rem), 1fr));
      gap: 0.5rem;
      min-height: ${SCREEN_HEIGHT}px;
      min-width: ${SCREEN_WIDTH}px;
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
  watchIPs?: Array<String> = [];

  @state()
  private dataList: Array<ScreencastMessage> = [];

  @state()
  private isConnecting: boolean = false;

  // Websocket connection
  private ws: WebSocket | null = null;

  private imageDataMap: Map<string, ScreencastMessage> = new Map();

  async updated(changedProperties: any) {
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

  protected firstUpdated() {
    // Connect to websocket server
    this.connectWs();
  }

  disconnectedCallback() {
    this.disconnectWs();
    super.disconnectedCallback();
  }

  render() {
    return html`
      <div class="wrapper${this.isConnecting ? " loading" : ""}">
        ${this.isConnecting ? html`<sl-spinner></sl-spinner>` : ""}
        <div class="container">
          ${this.dataList.map(
            (data) => html` <figure>
              <figcaption>${data.url}</figcaption>
              <img
                src="data:image/png;base64,${data.data}"
                title="${data.url}"
              />
            </figure>`
          )}
        </div>
      </div>
    `;
  }

  private connectWs() {
    if (!this.archiveId || !this.crawlId || !this.watchIPs || !this.watchIPs.length) return;

    this.isConnecting = true;

    const watchIP = this.watchIPs[0];

    this.ws = new WebSocket(
      `${window.location.protocol === "https:" ? "wss" : "ws"}:${
        process.env.API_HOST
      }/watch/${this.archiveId}/${
        this.crawlId
      }/${watchIP}/ws?auth_bearer=${this.authToken || ""}`
    );

    this.ws.addEventListener("error", () => {
      this.isConnecting = false;
    });
    this.ws.addEventListener("message", ({ data }) => {
      this.handleMessage(data);
    });
  }

  private disconnectWs() {
    this.isConnecting = false;

    if (this.ws) {
      this.ws.close();
    }

    this.ws = null;
  }

  private handleMessage(data: string) {
    const message: ScreencastMessage | CloseMessage = JSON.parse(data);

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
