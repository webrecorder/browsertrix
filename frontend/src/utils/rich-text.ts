import { html } from "lit";
import { guard } from "lit/directives/guard.js";

import { definitelyUrl, detectLinks, toShortUrl } from "./url-helpers";

/**
 * This is a rich text renderer that converts links in plain text into real links, in a similar way to the way social media posts often do.
 * Links always open in a new tab, and the link detection is generally pretty forgiving.
 *
 * This should generally be used when displaying descriptions or other medium-length user-generated plain text, e.g. org or workflow descriptions.
 *
 * For longer text, consider using a more complete markdown setup, e.g. a Collection’s “About” section.
 */
export function richText(
  content: string,
  linkClass = "text-cyan-500 font-medium transition-colors hover:text-cyan-600",
) {
  const links = detectLinks(content);
  return guard(
    [content, linkClass],
    () =>
      html`${links.map((segment) => {
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
            class="${linkClass}"
            >${toShortUrl(segment.link)}</a
          >`;
        }
      })}`,
  );
}
