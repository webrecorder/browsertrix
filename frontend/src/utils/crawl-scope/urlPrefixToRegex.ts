import { regexEscape, regexUnescape } from "@/utils/string";

/**
 * Convert a URL to a "custom" prefix regex
 */
export function urlPrefixToRegex(
  urlPrefix: string,
  { throwOnInvalid }: { throwOnInvalid?: boolean } = { throwOnInvalid: false },
) {
  const url = urlPrefix.replace(/^\^+/, "");

  if (urlPrefix.startsWith("^")) {
    if (regexEscape(regexUnescape(url)) === url) {
      // URL is already a prefix
      return urlPrefix;
    }
  }

  if (!url.startsWith("http")) {
    if (throwOnInvalid) {
      throw new Error("Invalid URL prefix");
    } else {
      console.error("Invalid URL prefix");
    }
  }
  return `^${regexEscape(url)}`;
}
