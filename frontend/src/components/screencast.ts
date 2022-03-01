import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import { ref, createRef, Ref } from "lit/directives/ref.js";
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
@localized()
export class Screencast extends LitElement {
  static styles = css`
    .wrapper {
      position: relative;
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

    img {
      display: block;
      width: 100%;
      height: auto;
      box-shadow: 0;
      outline: 0;
      border: 1px solid var(--sl-color-neutral-100);
      background-color: var(--sl-color-neutral-50);
      border-radius: var(--sl-border-radius-medium);
    }
  `;

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

  // Image container element
  private containerElementRef: Ref<HTMLElement> = createRef();

  // Map page ID to HTML img element
  private imageElementMap: Map<string, HTMLImageElement> = new Map();

  // Cache unused image elements
  private unusedImageElements: HTMLImageElement[] = [];

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
      <div class="wrapper">
        ${this.isConnecting ? html`<sl-spinner></sl-spinner>` : ""}
        <div ${ref(this.containerElementRef)} class="container"></div>
      </div>
    `;
  }

  private connectWs() {
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

      if (this.imageElementMap.has(id)) {
        this.updateImage(id, message.data);
      } else {
        this.addPage(id, message.data);
      }

      // Update URL that shows as image alt text
      this.imageElementMap.get(id)!.title = message.url;
    } else if (message.msg === "close") {
      this.unuseImage(id);
    }
  }

  private addPage(id: string, data: string) {
    let imgEl = this.unusedImageElements.shift();

    if (!imgEl) {
      imgEl = new Image(SCREEN_WIDTH, SCREEN_HEIGHT);
      this.containerElementRef.value?.appendChild(imgEl);
    }

    imgEl.src = `data:image/png;base64,${data}`;
    this.imageElementMap.set(id, imgEl);
  }

  private updateImage(id: string, data: string) {
    const imgEl = this.imageElementMap.get(id);

    imgEl!.src = `data:image/png;base64,${data}`;
  }

  private unuseImage(id: string) {
    const img = this.imageElementMap.get(id);

    if (img) {
      // Reset and move image to unused queue
      img.title = "";
      img.src = "";
      this.unusedImageElements.push(img);
      this.imageElementMap.delete(id);
    }
  }
}
