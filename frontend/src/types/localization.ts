import { z } from "zod";

import { allLocales } from "@/__generated__/locale-codes";

export const localeCodeEnum = z.enum(allLocales);
export type LocaleCodeEnum = z.infer<typeof localeCodeEnum>;
