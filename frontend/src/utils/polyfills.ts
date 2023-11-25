/* eslint-disable @typescript-eslint/no-explicit-any */
// cSpell:disable
/**
 * Object.entriesFrom() polyfill
 * @author Chris Ferdinandi
 * @license MIT
 */
if (!Object.fromEntries) {
  Object.fromEntries = function (entries: any) {
    if (!entries || !entries[Symbol.iterator]) {
      throw new Error(
        "Object.fromEntries() requires a single iterable argument"
      );
    }
    const obj: any = {};
    for (const [key, value] of entries) {
      obj[key] = value;
    }
    return obj;
  };
}
