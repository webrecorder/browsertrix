export function renderPercentage(ratio: number) {
  const percent = ratio * 100;
  if (percent < 1) return `<1%`;
  return `${percent.toFixed(2)}%`;
}
