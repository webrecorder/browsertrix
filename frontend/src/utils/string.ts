/**
 * Escape string to use as regex
 * From https://github.com/tc39/proposal-regex-escaping/blob/main/polyfill.js#L3
 *
 * @TODO Refactor to use `RegExp.escape()` https://github.com/webrecorder/browsertrix/issues/3797
 */
export function regexEscape(s: unknown) {
  return String(s).replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
}

export function regexUnescape(s: unknown) {
  return String(s).replace(/(\\|\/\.\*)/g, "");
}
