import { z } from "zod";

import { allLocales } from "@/__generated__/locale-codes";

// Translated languages to show in app:
export const translatedLocales = ["en"] as const;

export const localeCodeEnum = z.enum(allLocales);
export type LocaleCodeEnum = z.infer<typeof localeCodeEnum>;
