import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { detectLinks } from "@/utils/rich-text/detect-links";
import { definitelyUrl, toShortUrl } from "@/utils/rich-text/url-helpers";

/**
 * This is a rich text renderer that converts links in plain text into real links, in a similar way to the way social media posts often do.
 * Links always open in a new tab, and the link detection is generally pretty forgiving.
 *
 * This should generally be used when displaying descriptions or other medium-length user-generated plain text, e.g. org or workflow descriptions.
 *
 * For longer text, consider using a more complete markdown setup, e.g. a Collection’s “About” section.
 */
@customElement("btrix-rich-text")
export class RichText extends TailwindElement {
  @property({ type: String })
  content?: string;

  @property({ type: String })
  linkClass = "text-cyan-500 font-medium transition-colors hover:text-cyan-600";

  static styles = css`
    :host {
      display: contents;
    }
  `;

  render() {
    const links = detectLinks(this.content ?? "");
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
