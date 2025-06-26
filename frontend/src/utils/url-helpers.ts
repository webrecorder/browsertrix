// Adapted from https://github.com/bluesky-social/social-app/blob/main/src/lib/strings/url-helpers.ts and https://github.com/bluesky-social/social-app/blob/main/src/lib/strings/rich-text-detection.ts

import TLDs from "tlds";

export function isValidDomain(str: string): boolean {
  return !!TLDs.find((tld) => {
    const i = str.lastIndexOf(tld);
    if (i === -1) {
      return false;
    }
    return str.charAt(i - 1) === "." && i === str.length - tld.length;
  });
}

/**
 * Shortens a URL for use in rich text, etc. Remove protocol, trims "www." from the beginning of hosts, and trims pathname to a max length (configurable)
 * @param url URL to shorten
 * @param maxLength Max pathname length. Set to null to disable.
 */
export function toShortUrl(url: string, maxLength: number | null = 15): string {
  try {
    const urlp = new URL(url);
    if (urlp.protocol !== "http:" && urlp.protocol !== "https:") {
      return url;
    }
    const path =
      (urlp.pathname === "/" ? "" : urlp.pathname) + urlp.search + urlp.hash;
    if (maxLength && path.length > maxLength) {
      return urlp.host + path.slice(0, maxLength - 2) + "...";
    }
    if (urlp.host.startsWith("www.")) {
      return urlp.host.slice(4) + path;
    }
    return urlp.host + path;
  } catch (e) {
    return url;
  }
}

// passes URL.parse, and has a TLD etc
export function definitelyUrl(maybeUrl: string) {
  try {
    if (maybeUrl.endsWith(".")) return null;

    // Prepend 'https://' if the input doesn't start with a protocol
    if (!maybeUrl.startsWith("https://") && !maybeUrl.startsWith("http://")) {
      maybeUrl = "https://" + maybeUrl;
    }

    const url = new URL(maybeUrl);

    // Extract the hostname and split it into labels
    const hostname = url.hostname;
    const labels = hostname.split(".");

    // Ensure there are at least two labels (e.g., 'example' and 'com')
    if (labels.length < 2) return null;

    const tld = labels[labels.length - 1];

    // Check that the TLD is at least two characters long and contains only letters
    if (!/^[a-z]{2,}$/i.test(tld)) return null;

    return url.toString();
  } catch {
    return null;
  }
}

interface DetectedLink {
  link: string;
}
type DetectedLinkable = string | DetectedLink;
export function detectLinks(text: string): DetectedLinkable[] {
  const re =
    /((^|\s|\()@[a-z0-9.-]*)|((^|\s|\()https?:\/\/[\S]+)|((^|\s|\()(?<domain>[a-z][a-z0-9]*(\.[a-z0-9]+)+)[\S]*)/gi;
  const segments = [];
  let match;
  let start = 0;
  while ((match = re.exec(text))) {
    let matchIndex = match.index;
    let matchValue = match[0];

    if (match.groups?.domain && !isValidDomain(match.groups.domain)) {
      continue;
    }

    if (/\s|\(/.test(matchValue)) {
      // HACK
      // skip the starting space
      // we have to do this because RN doesnt support negative lookaheads
      // -prf
      matchIndex++;
      matchValue = matchValue.slice(1);
    }

    // strip ending punctuation
    if (/[.,;!?]$/.test(matchValue)) {
      matchValue = matchValue.slice(0, -1);
    }
    if (/[)]$/.test(matchValue) && !matchValue.includes("(")) {
      matchValue = matchValue.slice(0, -1);
    }

    if (start !== matchIndex) {
      segments.push(text.slice(start, matchIndex));
    }
    segments.push({ link: matchValue });
    start = matchIndex + matchValue.length;
  }
  if (start < text.length) {
    segments.push(text.slice(start));
  }
  return segments;
}
