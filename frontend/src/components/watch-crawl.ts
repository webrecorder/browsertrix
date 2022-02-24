import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { ref, createRef } from "lit/directives/ref.js";
import { guard } from "lit/directives/guard.js";
import { msg, localized } from "@lit/localize";

import LiteElement from "../utils/LiteElement";

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

const SCREEN_WIDTH = 640;
const SCREEN_HEIGHT = 480;

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
export class WatchCrawl extends LiteElement {
  @property({ type: String })
  authToken?: string;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @state()
  private isConnecting: boolean = false;

  // Websocket connection
  private ws: WebSocket | null = null;

  private canvasEl: HTMLCanvasElement | null = null;

  // Canvas 2D context used to draw images
  private canvasContext: CanvasRenderingContext2D | null = null;

  // Image to load into canvas
  private canvasImage = new Image();

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
    return html`
      <figure class="relative border rounded">
        ${this.isConnecting
          ? html`
              <div
                class="absolute top-1/2 left-1/2 -mt-4 -ml-4"
                style="font-size: 2rem"
              >
                <sl-spinner></sl-spinner>
              </div>
            `
          : ""}

        <canvas ${ref(this.setCanvasRef)}> </canvas>
      </figure>
    `;
  }

  private setCanvasRef(el: Element | undefined) {
    if (el) {
      this.canvasEl = el as HTMLCanvasElement;

      // Set resolution
      const ratio = window.devicePixelRatio;
      this.canvasEl.width = SCREEN_WIDTH * ratio;
      this.canvasEl.height = (SCREEN_HEIGHT + 20) * ratio;
      // Set CSS size
      this.canvasEl.style.width = `${SCREEN_WIDTH}px`;
      this.canvasEl.style.height = `${SCREEN_HEIGHT + 20}px`;

      this.canvasContext = this.canvasEl.getContext("2d");
      this.canvasContext?.scale(ratio, ratio);
    }
  }

  private connectWs() {
    console.log("open");
    if (!this.archiveId || !this.crawlId) return;

    this.isConnecting = true;

    this.ws = new WebSocket(
      `${window.location.protocol === "https:" ? "wss" : "ws"}:${
        process.env.API_HOST
      }/api/archives/${this.archiveId}/crawls/${
        this.crawlId
      }/watch/ws?auth_bearer=${this.authToken || ""}`
    );

    // this.ws.addEventListener("open", () => {
    //   this.isConnecting = false;
    // });
    this.ws.addEventListener("error", () => {
      this.isConnecting = false;
    });
    this.ws.addEventListener("message", ({ data }) => {
      this.handleMessage(data);
    });
  }

  private disconnectWs() {
    this.isConnecting = false;

    console.log("close");

    if (this.ws) {
      this.ws.close();
    }

    this.ws = null;
  }

  private handleMessage(data: string) {
    const message: ScreencastMessage | CloseMessage = JSON.parse(data);

    // TODO multiple pages

    if (message.msg === "screencast") {
      if (this.isConnecting) {
        this.isConnecting = false;
      }

      this.canvasImage.src = `data:image/png;base64,${message.data}`;

      this.canvasContext?.drawImage(
        this.canvasImage,
        0,
        20,
        SCREEN_WIDTH,
        SCREEN_HEIGHT + 20
      );
      this.canvasContext?.clearRect(0, 0, SCREEN_WIDTH, 20);
      this.canvasContext?.fillText(message.url, 0, 0 + 10);
    } else if (message.msg === "close") {
      // TODO
    }
  }
}
