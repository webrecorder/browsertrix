import { LitElement, html, css } from "lit";
import { msg, localized, str } from "@lit/localize";
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
@localized()
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

    .screen-count {
      color: var(--sl-color-neutral-400);
      font-size: var(--sl-font-size-small);
      margin-bottom: var(--sl-spacing-x-small);
    }

    .screen-count span,
    .screen-count sl-icon {
      display: inline-block;
      vertical-align: middle;
    }

    .screen {
      border: 1px solid var(--sl-panel-border-color);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .screen[role="button"] {
      cursor: pointer;
      transition: opacity 0.1s border-color 0.1s;
    }

    .screen[role="button"]:hover {
      opacity: 0.8;
      border-color: var(--sl-color-neutral-300);
    }

    figure {
      margin: 0;
    }

    .caption {
      padding: var(--sl-spacing-x-small);
      flex: 1;
      border-bottom: 1px solid var(--sl-panel-border-color);
      color: var(--sl-color-neutral-600);
    }

    .caption,
    .dialog-label {
      display: block;
      font-size: var(--sl-font-size-x-small);
      line-height: 1;
      /* Truncate: */
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dialog-label {
      max-width: 40em;
    }

    .frame {
      background-color: var(--sl-color-neutral-50);
      overflow: hidden;
    }

    .frame > img {
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

  @property({ type: Number })
  scale: number = 1;

  // List of browser screens
  @state()
  private dataList: Array<ScreencastMessage | null> = [];

  @state()
  private isConnecting: boolean = false;

  @state()
  private focusedScreenData?: ScreencastMessage;

  // Websocket connections
  private wsMap: Map<number, WebSocket> = new Map();
  // Map data order to screen data
  private dataMap: { [index: number]: ScreencastMessage | null } = {};
  // Map page ID to data order
  private pageOrderMap: Map<string, number> = new Map();
  // Number of available browsers.
  // Multiply by scale to get available browser window count
  private browsersCount = 1;
  private screenWidth = 640;
  private screenHeight = 480;

  protected firstUpdated() {
    this.isConnecting = true;

    // Connect to websocket server
    this.connectWs();
  }

  async updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.get("archiveId") ||
      changedProperties.get("crawlId") ||
      changedProperties.get("scale") ||
      changedProperties.get("authToken")
    ) {
      console.log("updated");
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
    const browserWindows = this.browsersCount * this.scale;

    return html`
      <div class="wrapper">
        ${this.isConnecting || !this.dataList.length
          ? html`<div class="spinner">
              <sl-spinner></sl-spinner>
            </div> `
          : html`
              <div class="screen-count">
                <span
                  >${browserWindows > 1
                    ? msg(str`Running in ${browserWindows} browser windows`)
                    : msg(str`Running in 1 browser window`)}</span
                >
                <sl-tooltip
                  content=${msg(
                    str`${this.browsersCount} browser(s) × ${this.scale} crawler(s). Number of crawlers corresponds to scale.`
                  )}
                  ><sl-icon name="info-circle"></sl-icon
                ></sl-tooltip>
              </div>
            `}

        <div
          class="container"
          style="grid-template-columns: repeat(${this
            .browsersCount}, minmax(0, 1fr)); grid-template-rows: repeat(${this
            .scale}, minmax(2rem, auto))"
        >
          ${this.dataList.map(
            (pageData) =>
              html` <figure
                class="screen"
                title=${pageData?.url || ""}
                role=${pageData ? "button" : "presentation"}
                @click=${pageData
                  ? () => (this.focusedScreenData = pageData)
                  : () => {}}
              >
                <figcaption class="caption">
                  ${pageData?.url || html`&nbsp;`}
                </figcaption>
                <div
                  class="frame"
                  style="aspect-ratio: ${this.screenWidth / this.screenHeight}"
                >
                  ${pageData
                    ? html`<img src="data:image/png;base64,${pageData.data}" />`
                    : ""}
                </div>
              </figure>`
          )}
        </div>
      </div>

      <sl-dialog
        ?open=${Boolean(this.focusedScreenData)}
        style="--width: ${this.screenWidth}px;
          --header-spacing: var(--sl-spacing-small);
          --body-spacing: 0;
          "
        @sl-after-hide=${this.unfocusScreen}
      >
        <span
          class="dialog-label"
          slot="label"
          title=${this.focusedScreenData?.url || ""}
        >
          ${this.focusedScreenData?.url}
        </span>

        ${this.focusedScreenData
          ? html`
              <img
                src="data:image/png;base64,${this.focusedScreenData.data}"
                title="${this.focusedScreenData.url}"
              />
            `
          : ""}
      </sl-dialog>
    `;
  }

  private connectWs() {
    if (!this.archiveId || !this.crawlId) {
      return;
    }

    const baseURL = `${window.location.protocol === "https:" ? "wss" : "ws"}:${
      process.env.WEBSOCKET_HOST || window.location.host
    }/watch/${this.archiveId}/${this.crawlId}`;

    for (let idx = 0; idx < this.scale; idx++) {
      const ws = new WebSocket(
        `${baseURL}/${idx}/ws?auth_bearer=${this.authToken || ""}`
      );

      ws.addEventListener("open", () => {
        if (this.wsMap.size === this.scale) {
          this.isConnecting = false;
        }
      });
      ws.addEventListener("close", () => {
        this.wsMap.delete(idx);
      });
      ws.addEventListener("error", () => {
        this.isConnecting = false;
      });
      ws.addEventListener("message", ({ data }) => {
        this.handleMessage(JSON.parse(data));
      });

      this.wsMap.set(idx, ws);
    }
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
      this.dataList = Array.from(
        { length: message.browsers * this.scale },
        () => null
      );
      this.dataMap = this.dataList.reduce(
        (acc, val, i) => ({
          ...acc,
          [i]: val,
        }),
        {}
      );
      this.browsersCount = message.browsers;
      this.screenWidth = message.width;
      this.screenHeight = message.height;
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

        let idx = this.pageOrderMap.get(id);

        if (idx === undefined) {
          // Find and fill first empty slot
          idx = this.dataList.indexOf(null);

          if (idx === -1) {
            console.debug("no empty slots");
          }

          this.pageOrderMap.set(id, idx);
        }

        if (this.focusedScreenData?.id === id) {
          this.focusedScreenData = message;
        }

        this.dataMap[idx] = message;
        this.updateDataList();
      } else if (message.msg === "close") {
        const idx = this.pageOrderMap.get(id);

        if (idx !== undefined && idx !== null) {
          this.dataMap[idx] = null;
          this.updateDataList();
          this.pageOrderMap.set(id, -1);
        }
      }
    }
  }

  updateDataList() {
    this.dataList = Object.values(this.dataMap);
  }

  unfocusScreen() {
    this.updateDataList();
    this.focusedScreenData = undefined;
  }
}
