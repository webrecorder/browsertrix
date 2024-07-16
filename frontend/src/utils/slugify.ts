import slugify from "slugify";

import { getLocale } from "./localization";

export default function slugifyStrict(value: string) {
  return slugify(value, { strict: true, lower: true, locale: getLocale() });
}
