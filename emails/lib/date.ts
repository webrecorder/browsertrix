export const offsetDays = (days: number, from = new Date()) => {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date;
};

export const formatDate = (date: Date) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return formatter.format(date);
};

export const differenceInDays = (date1: Date, date2 = new Date()) => {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const formatRelativeDate = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string => {
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  return formatter.format(value, unit);
};

export const formatRelativeDateToParts = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): Intl.RelativeTimeFormatPart[] => {
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  return formatter.formatToParts(value, unit);
};
