import { msg, str } from "@lit/localize";

import { noData } from "@/strings/ui";
import localize from "@/utils/localize";

export const monthYearDateRange = (
  startDate?: string | null,
  endDate?: string | null,
): string => {
  if (!startDate || !endDate) {
    return noData;
  }
  const format: Intl.DateTimeFormatOptions = {
    month: "long",
    year: "numeric",
  };
  const startMonthYear = localize.date(startDate, format);
  const endMonthYear = localize.date(endDate, format);

  if (startMonthYear === endMonthYear) return endMonthYear;

  return msg(str`${startMonthYear} to ${endMonthYear}`, {
    desc: "Date range formatted to show full month name and year",
  });
};
