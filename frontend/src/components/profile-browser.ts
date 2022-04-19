// import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

// TODO remove sidebar constaint once devtools panel
// is hidden on the backend
const SIDE_BAR_WIDTH = 288;

/**
 * View embedded profile browser
 *
 * Usage example:
 * ```ts
 * <btrix-profile-browser
 *   browserSrc=${browserSrc}
 *   isFullscreen=${isFullscreen}
 * ></btrix-profile-browser>
 * ```
 */
@localized()
export class ProfileBrowser extends LiteElement {
  /** Iframe browserUrl */
  @property({ type: String })
  browserSrc?: string;

  @property({ type: Boolean })
  isFullscreen = false;

  @property({ type: Boolean })
  isLoading = false;

  render() {
    if (this.isLoading)
      return html`
        <div
          class="h-96 bg-slate-50 flex items-center justify-center text-4xl"
          style="padding-right: ${SIDE_BAR_WIDTH}px"
        >
          <sl-spinner></sl-spinner>
        </div>
      `;

    return html`
      <div
        class="bg-slate-50 w-full ${this.isFullscreen ? "h-screen" : "h-96"}"
      >
        ${this.browserSrc
          ? html`<iframe
              class="w-full h-full"
              title=${msg("Interactive browser for creating browser profile")}
              src=${this.browserSrc}
              ${ref((el) => this.onIframeRef(el as HTMLIFrameElement))}
            ></iframe>`
          : ""}
      </div>
    `;
  }

  private onIframeRef(el: HTMLIFrameElement) {
    if (!el) return;

    el.addEventListener("load", () => {
      // TODO see if we can make this work locally without CORs errors
      try {
        //el.style.width = "132%";
        el.contentWindow?.localStorage.setItem("uiTheme", '"default"');
        el.contentWindow?.localStorage.setItem(
          "InspectorView.screencastSplitViewState",
          `{"vertical":{"size":${SIDE_BAR_WIDTH}}}`
        );
      } catch (e) {}
    });
  }
}
