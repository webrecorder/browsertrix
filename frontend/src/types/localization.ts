import ISO6391, { type LanguageCode } from "iso-639-1";
import { z } from "zod";

import { allLocales } from "@/__generated__/locale-codes";

export { allLocales as translatedLocales };

export const translatedLocaleEnum = z.enum(allLocales);
export type TranslatedLocaleEnum = z.infer<typeof translatedLocaleEnum>;

export const allLanguageCodes = ISO6391.getAllCodes();
export type AllLanguageCodes = readonly LanguageCode[];

export const languageCodeSchema = z.custom<LanguageCode>((val) =>
  typeof val === "string"
    ? (allLanguageCodes as string[]).includes(val)
    : false,
);
export type { LanguageCode };
