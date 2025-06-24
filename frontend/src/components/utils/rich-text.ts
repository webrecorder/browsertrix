import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { detectLinks } from "@/utils/rich-text/detect-links";
import { definitelyUrl, toShortUrl } from "@/utils/rich-text/url-helpers";

@customElement("btrix-rich-text")
export class RichText extends TailwindElement {
  @property({ type: String })
  content = "";

  @property({ type: String })
  linkClass = "text-cyan-500 font-medium transition-colors hover:text-cyan-600";

  static styles = css`
    :host {
      display: contents;
    }
  `;

  render() {
    const links = detectLinks(this.content);
    return html`${links.map((segment) => {
      if (typeof segment === "string") {
        return segment;
      } else {
        const url = definitelyUrl(segment.link);
        if (!url) {
          return segment.link;
        }
        return html`<a
          href="${url}"
          target="_blank"
          rel="noopener noreferrer"
          class="${this.linkClass}"
          >${toShortUrl(segment.link)}</a
        >`;
      }
    })}`;
  }
}
