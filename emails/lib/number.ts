export const formatNumber = (number: number): string => {
  const formatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  });
  return formatter.format(number);
};
