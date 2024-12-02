import parseMilliseconds from "parse-ms";
import type { Options } from "pretty-ms";

type Mutable<Type> = {
  -readonly [Key in keyof Type]: Type[Key];
};

export type HumanizeOptions = Mutable<Omit<Options, "colonNotation">>;

// const pluralize = (word, count) => (count === 1 ? word : `${word}s`);

const SECOND_ROUNDING_EPSILON = 0.0000001;

const format = (
  milliseconds: number,
  options: HumanizeOptions = {},
): Intl.DurationType => {
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("Expected a finite number");
  }

  if (options.compact) {
    options.secondsDecimalDigits = 0;
    options.millisecondsDecimalDigits = 0;
  }

  const result: Intl.DurationType = { seconds: 0 };

  const floorDecimals = (value: number, decimalDigits: number) => {
    const flooredInterimValue = Math.floor(
      value * 10 ** decimalDigits + SECOND_ROUNDING_EPSILON,
    );
    const flooredValue = Math.round(flooredInterimValue) / 10 ** decimalDigits;
    return flooredValue.toFixed(decimalDigits);
  };

  const add = (value: number, long: Intl.DurationTimeFormatUnit) => {
    result[long] = value;
  };

  const parsed = parseMilliseconds(milliseconds);

  add(Math.trunc(parsed.days / 365), "years");
  add(parsed.days % 365, "days");
  add(parsed.hours, "hours");
  add(parsed.minutes, "minutes");

  if (options.separateMilliseconds || options.formatSubMilliseconds) {
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

      const millisecondsDecimalDigits =
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

      add(Number.parseFloat(millisecondsString.toString()), "milliseconds");
    }
  } else {
    const seconds = (milliseconds / 1000) % 60;
    const secondsDecimalDigits =
      typeof options.secondsDecimalDigits === "number"
        ? options.secondsDecimalDigits
        : 1;
    const secondsFixed = floorDecimals(seconds, secondsDecimalDigits);
    const secondsString = options.keepDecimalsOnWholeSeconds
      ? secondsFixed
      : secondsFixed.replace(/\.0+$/, "");
    add(Number.parseFloat(secondsString), "seconds");
  }

  // if (result.length === 0) {
  //   return "0" + (options.verbose ? " milliseconds" : "ms");
  // }

  // if (options.compact) {
  //   return result[0];
  // }

  if (typeof options.unitCount === "number") {
    return Object.fromEntries(
      Object.entries(result).slice(0, Math.max(options.unitCount, 1)),
    ) as Intl.DurationType;
  }

  return result;
};

export default format;
