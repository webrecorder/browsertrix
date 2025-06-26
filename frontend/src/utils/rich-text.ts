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
 *
 * Options:
 * - linkClass: The CSS class to apply to the links. Has some useful defaults, but can be overridden if necessary.
 * - shortenOnly: Whether to only shorten the links, without converting them to real links. Useful when being used inside another link block (e.g. card links)
 * - maxLength: The maximum length of path portion of the shortened URL. Defaults to 15 characters.
 */
export function richText(
  content: string,
  options: {
    linkClass?: string;
    shortenOnly?: boolean;
    maxLength?: number | null;
  } = {},
) {
  const {
    shortenOnly,
    linkClass = shortenOnly
      ? "font-medium"
      : "text-cyan-500 font-medium transition-colors hover:text-cyan-600",
    maxLength = 15,
  } = options;
  const links = detectLinks(content);
  return guard(
    [content, linkClass, maxLength, shortenOnly],
    () =>
      html`${links.map((segment) => {
        if (typeof segment === "string") {
          return segment;
        } else {
          const url = definitelyUrl(segment.link);
          if (!url) {
            return segment.link;
          }
          if (shortenOnly) {
            return html`<span class="${linkClass}" title="${url}"
              >${toShortUrl(segment.link, maxLength)}</span
            >`;
          }
          return html`<a
            href="${url}"
            target="_blank"
            rel="noopener noreferrer"
            class="${linkClass}"
            >${toShortUrl(segment.link, maxLength)}</a
          >`;
        }
      })}`,
  );
}
