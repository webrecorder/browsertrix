import parseMilliseconds from "parse-ms";
import type { Options } from "pretty-ms";

type Mutable<Type> = {
  -readonly [Key in keyof Type]: Type[Key];
};

export type HumanizeOptions = Mutable<
  Omit<
    Options,
    | "colonNotation"
    | "verbose"
    | "millisecondsDecimalDigits"
    | "secondsDecimalDigits"
    | "keepDecimalsOnWholeSeconds"
  >
>;

// const SECOND_ROUNDING_EPSILON = 0.0000001;

/**
 * Convert a duration in milliseconds into a rounded {@linkcode Intl.DurationType} object.
 *
 * Almost all of the logic and options here are copied verbatim from {@linkcode https://github.com/sindresorhus/pretty-ms/blob/v7.0.1/index.js|pretty-ms@7.0.1}, but converted to return a {@linkcode Intl.DurationType} rather than a string for use with {@linkcode Intl.DurationFormat.format}.
 */
const roundDuration = (
  milliseconds: number,
  options: HumanizeOptions = {},
): Intl.DurationType => {
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("Expected a finite number");
  }

  /* if (options.compact) {
    options.secondsDecimalDigits = 0;
    options.millisecondsDecimalDigits = 0;
  } */

  const result = {} as Intl.DurationType;

  /* const floorDecimals = (value: number, decimalDigits: number) => {
    const flooredInterimValue = Math.floor(
      value * 10 ** decimalDigits + SECOND_ROUNDING_EPSILON,
    );
    const flooredValue = Math.round(flooredInterimValue) / 10 ** decimalDigits;
    return flooredValue.toFixed(decimalDigits);
  }; */

  const add = (value: number, long: Intl.DurationTimeFormatUnit) => {
    if (value === 0) return;

    result[long] = value;
  };

  const parsed = parseMilliseconds(milliseconds);

  add(Math.trunc(parsed.days / 365), "years");
  add(parsed.days % 365, "days");
  add(parsed.hours, "hours");
  add(parsed.minutes, "minutes");

  if (
    options.separateMilliseconds ||
    options.formatSubMilliseconds ||
    milliseconds < 1000
  ) {
    add(parsed.seconds, "seconds");
    if (options.formatSubMilliseconds) {
      add(parsed.milliseconds, "milliseconds");
      add(parsed.microseconds, "microseconds");
      add(parsed.nanoseconds, "nanoseconds");
    } else {
      const millisecondsAndBelow =
        parsed.milliseconds +
        parsed.microseconds / 1000 +
        parsed.nanoseconds / 1e6;

      // Intl.DurationFormat doesn't support non-integer values
      /* const millisecondsDecimalDigits =
        typeof options.millisecondsDecimalDigits === "number"
          ? options.millisecondsDecimalDigits
          : 0;

      const roundedMilliseconds =
        millisecondsAndBelow >= 1
          ? Math.round(millisecondsAndBelow)
          : Math.ceil(millisecondsAndBelow);

      const millisecondsString = millisecondsDecimalDigits
        ? millisecondsAndBelow.toFixed(millisecondsDecimalDigits)
        : roundedMilliseconds;

      add(Number.parseFloat(millisecondsString.toString()), "milliseconds"); */
      const roundedMilliseconds =
        millisecondsAndBelow >= 1
          ? Math.round(millisecondsAndBelow)
          : Math.ceil(millisecondsAndBelow);
      add(roundedMilliseconds, "milliseconds");
    }
  } else {
    const seconds = (milliseconds / 1000) % 60;
    // Intl.DurationFormat doesn't support non-integer values
    /* const secondsDecimalDigits =
      typeof options.secondsDecimalDigits === "number"
        ? options.secondsDecimalDigits
        : 1;
    const secondsFixed = floorDecimals(seconds, secondsDecimalDigits);
    const secondsString = options.keepDecimalsOnWholeSeconds
      ? secondsFixed
      : secondsFixed.replace(/\.0+$/, "");
    add(Number.parseFloat(secondsString), "seconds"); */
    const roundedSeconds =
      seconds >= 1 ? Math.round(seconds) : Math.ceil(seconds);
    add(roundedSeconds, "seconds");
  }

  if (Object.keys(result).length === 0) {
    return { milliseconds: 0 };
  }

  if (options.compact) {
    return Object.fromEntries(
      Object.entries(result).slice(0, 1),
    ) as Intl.DurationType;
  }

  if (typeof options.unitCount === "number") {
    return Object.fromEntries(
      Object.entries(result).slice(0, Math.max(options.unitCount, 1)),
    ) as Intl.DurationType;
  }

  return result;
};

export default roundDuration;
