import { regexUnescape } from "@/utils/string";

/**
 * Unescape "custom" scope prefix URL for user display
 */
export function unescapeCustomPrefix(urlPrefix: string) {
  return regexUnescape(urlPrefix.replace(/^\^+/, ""));
}
