import localize from "./localize";

/**
 * Returns either `nothing`, or hours-minutes-seconds wrapped in parens.
 * Biases towards minutes:
 * - When the time is exactly on an hour boundary, just shows hours
 *   - e.g. `3h`
 * - When the time isn't on an hour boundary but is on a minute boundary, just shows hours (if applicable) and minutes
 *   - e.g. `3h 2m` or `32m`
 * - When the time is less than a minute, shows minutes and seconds
 *   - e.g. `0m 43s`
 */
export function humanizeSeconds(
  seconds: number,
  {
    locale,
    displaySeconds = false,
    unitDisplay = "narrow",
  }: {
    locale?: string;
    displaySeconds?: boolean;
    unitDisplay?: "narrow" | "short" | "long";
  } = {},
) {
  if (seconds < 0) {
    throw new Error("humanizeSeconds in unimplemented for negative times");
  }
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  // If displaying seconds, round minutes down, otherwise round up
  const minutes = displaySeconds
    ? Math.floor(seconds / 60)
    : Math.ceil(seconds / 60);
  seconds -= minutes * 60;

  const hourFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "hour",
    unitDisplay: unitDisplay,
  });

  const minuteFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: unitDisplay,
  });

  const secondFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "second",
    unitDisplay: unitDisplay,
  });

  return [
    hours !== 0 && hourFormatter.format(hours),
    (minutes !== 0 || seconds !== 0 || (!displaySeconds && hours === 0)) &&
      minuteFormatter.format(minutes),
    displaySeconds &&
      (seconds !== 0 || (hours === 0 && minutes === 0)) &&
      secondFormatter.format(seconds),
  ]
    .filter(Boolean)
    .join(" ");
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
  options?: {
    /**
     * When this is "long", the time in hours is also displayed
     * @default "long"
     */
    style?: "short" | "long";
    /**
     * @default false
     */
    fractional?: boolean;
    /**
     * @default "up"
     */
    round?: "up" | "down";
  },
) => {
  const {
    style = "long",
    fractional = seconds < 60 || (options?.style ?? "long") === "long",
    round = "up",
  } = options || {};
  let minutes = seconds / 60;
  if (!fractional) {
    minutes = round === "down" ? Math.floor(minutes) : Math.ceil(minutes);
  }
  return localize.number(minutes, {
    style: "unit",
    unit: "minute",
    unitDisplay: style,
    maximumFractionDigits: fractional ? 2 : 0,
  });
};
