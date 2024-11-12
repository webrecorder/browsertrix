import slugify from "slugify";

import { getActiveLanguage } from "@/controllers/localize";

export default function slugifyStrict(value: string) {
  return slugify(value, {
    strict: true,
    lower: true,
    locale: getActiveLanguage(),
  });
}
