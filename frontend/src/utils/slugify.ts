import slugify from "slugify";

import localize from "./localize";

export default function slugifyStrict(value: string) {
  return slugify(value, {
    strict: true,
    lower: true,
    locale: localize.activeLanguage,
  });
}
