import { configureLocalization } from "@lit/localize";

import { sourceLocale, targetLocales } from "../__generated__/locale-codes";

export const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: (locale: string) =>
    import(`/src/__generated__/locales/${locale}.ts`),
});

export const setLocaleFromUrl = async () => {
  const url = new URL(window.location.href);
  const locale = url.searchParams.get("locale") || sourceLocale;
  await setLocale(locale);
};
