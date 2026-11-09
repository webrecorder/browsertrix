import { regexEscape } from "./string";

/**
 * Convert a prefix crawl scope to regex
 */
export function prefixToRegex(str: string) {
  return `^${regexEscape(str)}`;
}
