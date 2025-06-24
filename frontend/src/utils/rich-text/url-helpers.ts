// Adapted from https://github.com/bluesky-social/social-app/blob/main/src/lib/strings/url-helpers.ts

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
