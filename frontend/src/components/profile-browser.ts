// import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

/**
 * View embedded profile browser
 *
 * Usage example:
 * ```ts
 * <btrix-profile-browser
 *   browserSrc=${browserSrc}
 * ></btrix-profile-browser>
 * ```
 */
@localized()
export class ProfileBrowser extends LiteElement {
  // TODO remove sidebar constaint once devtools panel
  // is hidden on the backend
  static SIDE_BAR_WIDTH = 288;

  /** Iframe browserUrl */
  @property({ type: String })
  browserSrc?: string;

  render() {
    return html`
      ${this.browserSrc
        ? html`<iframe
            class="w-full h-full"
            title=${msg("Interactive browser for creating browser profile")}
            src=${this.browserSrc}
            ${ref((el) => this.onIframeRef(el as HTMLIFrameElement))}
          ></iframe>`
        : ""}
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
          `{"vertical":{"size":${ProfileBrowser.SIDE_BAR_WIDTH}}}`
        );
      } catch (e) {}
    });
  }
}
