import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { ref, createRef } from "lit/directives/ref.js";
import { guard } from "lit/directives/guard.js";
import { msg, localized } from "@lit/localize";

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
export class WatchCrawl extends LitElement {
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

  // Page data
  private pageMap: Map<string, number> = new Map();
  private pageImages: (HTMLImageElement | null)[] = [null];

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
      <div>
        ${this.isConnecting ? html` <sl-spinner></sl-spinner> ` : ""}

        <canvas ${ref(this.setCanvasRef)} style="outline: 1px solid red">
        </canvas>
      </div>
    `;
  }

  private setCanvasRef(el: Element | undefined) {
    if (el) {
      this.canvasEl = el as HTMLCanvasElement;
      this.canvasEl.width = SCREEN_WIDTH;
      this.canvasEl.height = SCREEN_HEIGHT;
      this.canvasContext = this.canvasEl.getContext("2d");
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
      if (this.isConnecting) {
        this.isConnecting = false;
      }

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

    const id = message.id;

    // TODO tile pages based on screen size

    if (message.msg === "screencast") {
      let idx = this.pageMap.get(id);

      if (typeof idx === "undefined" || idx === null) {
        // Find empty image slot
        idx = this.pageImages.indexOf(null);

        if (idx === -1) {
          idx = this.pageImages.push(null) - 1;
        }

        this.pageImages[idx] = new Image();
        this.pageMap.set(id, idx);
        this.canvasEl!.height = SCREEN_HEIGHT * this.pageImages.length;
      }

      const img = this.pageImages[idx]!;
      img.src = `data:image/png;base64,${message.data}`;

      const x = 0;
      const y = idx * SCREEN_HEIGHT;
      console.log(id, message.url, idx, y);

      this.canvasContext?.drawImage(img, x, y, SCREEN_WIDTH, SCREEN_HEIGHT);
      this.canvasContext?.fillText(message.url, x, y + 10);
    } else if (message.msg === "close") {
      const idx = this.pageMap.get(id);

      if (idx && idx > -1) {
        if (this.pageImages.indexOf(null) > -1) {
          delete this.pageImages[idx];
        } else {
          this.pageImages[idx] = null;
        }

        // this.canvasContext?.clearRect(
        //   0,
        //   idx * SCREEN_HEIGHT,
        //   SCREEN_WIDTH,
        //   SCREEN_HEIGHT
        // );
        this.pageMap.delete(id);
        this.canvasEl!.height = SCREEN_HEIGHT * this.pageImages.length;
      }
    }
  }
}
