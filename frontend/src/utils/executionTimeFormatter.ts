import { html, nothing } from "lit";
import { getLocale } from "./localization";

/**
 * Returns either `nothing`, or hours-minutes-seconds wrapped in parens.
 * Biases towards minutes:
 * - When the time is exactly on an hour boundary, just shows hours
 *   - e.g. `3h`
 * - When the time isn't on an hour boundary but is on a minute broundary, just shows hours (if applicable) and minutes
 *   - e.g. `3h 2m` or `32m`
 * - When the time is less than a minute, shows minutes and seconds
 *   - e.g. `0m 43s`
 */
export function formatHours(seconds: number, locale?: string) {
  const billableMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  if (minutes === billableMinutes) {
    return nothing;
  }

  const hourFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "hour",
    unitDisplay: "narrow",
  });

  const minuteFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "narrow",
  });

  const secondFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "second",
    unitDisplay: "narrow",
  });

  return `\u00a0(${[
    hours !== 0 && hourFormatter.format(hours),
    (minutes !== 0 || seconds !== 0) && minuteFormatter.format(minutes),
    seconds !== 0 && secondFormatter.format(seconds),
  ]
    .filter(Boolean)
    .join(" ")})`;
}

/**
 * Formats execution seconds, either just as minutes (when `style` is `"short"`), or as minutes and hours-minutes-seconds (when `style` is undefined or `"full"`)
 * @example humanizeExecutionSeconds(1_234_567_890)
 * // <span title="20,576,132 minutes">21M minutes</span> (342,935h 31m 30s)
 *
 * @example humanizeExecutionSeconds(1_234_567_890, "short")
 * // <span title="20,576,132 minutes (342,935h 31m 30s)">21M minutes</span>
 */
export const humanizeExecutionSeconds = (
  seconds: number,
  style: "short" | "full" = "full"
) => {
  const locale = getLocale();
  const minutes = Math.ceil(seconds / 60);

  const compactMinuteFormatter = new Intl.NumberFormat(locale, {
    notation: "compact",
    style: "unit",
    unit: "minute",
    unitDisplay: "long",
  });

  const longMinuteFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "long",
    maximumFractionDigits: 0,
  });

  switch (style) {
    case "full":
      return html`<span title="${longMinuteFormatter.format(minutes)}">
          ${compactMinuteFormatter.format(minutes)}</span
        >${formatHours(seconds)}`;
    case "short":
      return html`<span
        title="${longMinuteFormatter.format(minutes)}${formatHours(seconds)}"
        >${compactMinuteFormatter.format(minutes)}</span
      >`;
  }
};
