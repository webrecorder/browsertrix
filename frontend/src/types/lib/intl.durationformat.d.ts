/**
 * Types for Intl.DurationFormat
 *
 * TODO remove once https://github.com/microsoft/TypeScript/issues/60608 is done
 * Partially copied from https://github.com/microsoft/TypeScript/pull/60646
 */

type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> &
  U[keyof U];

declare namespace Intl {
  /**
   * Value of the `unit` property in duration objects
   *
   * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DurationFormat/format#duration).
   */
  type DurationTimeFormatUnit =
    | "years"
    | "months"
    | "weeks"
    | "days"
    | "hours"
    | "minutes"
    | "seconds"
    | "milliseconds"
    | "microseconds"
    | "nanoseconds";

  type DurationFormatStyle = "long" | "short" | "narrow" | "digital";

  type DurationFormatUnitSingular =
    | "year"
    | "quarter"
    | "month"
    | "week"
    | "day"
    | "hour"
    | "minute"
    | "second";

  /**
   * An object representing the relative time format in parts
   * that can be used for custom locale-aware formatting.
   *
   * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/formatToParts#Using_formatToParts).
   */
  type DurationFormatPart =
    | {
        type: "literal";
        value: string;
      }
    | {
        type: Exclude<NumberFormatPartTypes, "literal">;
        value: string;
        unit: DurationFormatUnitSingular;
      };

  type ResolvedDurationFormatOptions = {
    locale: UnicodeBCP47LocaleIdentifier;
    numberingSystem: DateTimeFormatOptions["numberingSystem"];
    style: DurationFormatStyle;
    years: "long" | "short" | "narrow";
    yearsDisplay: "always" | "auto";
    months: "long" | "short" | "narrow";
    monthsDisplay: "always" | "auto";
    weeks: "long" | "short" | "narrow";
    weeksDisplay: "always" | "auto";
    days: "long" | "short" | "narrow";
    daysDisplay: "always" | "auto";
    hours: "long" | "short" | "narrow" | "numeric" | "2-digit";
    hoursDisplay: "always" | "auto";
    minutes: "long" | "short" | "narrow" | "numeric" | "2-digit";
    minutesDisplay: "always" | "auto";
    seconds: "long" | "short" | "narrow" | "numeric" | "2-digit";
    secondsDisplay: "always" | "auto";
    milliseconds: "long" | "short" | "narrow" | "numeric" | "2-digit";
    millisecondsDisplay: "always" | "auto";
    microseconds: "long" | "short" | "narrow" | "numeric" | "2-digit";
    microsecondsDisplay: "always" | "auto";
    nanosecond: "long" | "short" | "narrow" | "numeric" | "2-digit";
    nanosecondDisplay: "always" | "auto";
    fractionalDigits: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  };

  interface DurationFormatOptions {
    localeMatcher?: LocaleMatcher;
    numberingSystem?: DateTimeFormatOptions["numberingSystem"];
    style?: DurationFormatStyle;
    years?: "long" | "short" | "narrow";
    yearsDisplay?: "always" | "auto";
    months?: "long" | "short" | "narrow";
    monthsDisplay?: "always" | "auto";
    weeks?: "long" | "short" | "narrow";
    weeksDisplay?: "always" | "auto";
    days?: "long" | "short" | "narrow";
    daysDisplay?: "always" | "auto";
    hours?: "long" | "short" | "narrow" | "numeric" | "2-digit";
    hoursDisplay?: "always" | "auto";
    minutes?: "long" | "short" | "narrow" | "numeric" | "2-digit";
    minutesDisplay?: "always" | "auto";
    seconds?: "long" | "short" | "narrow" | "numeric" | "2-digit";
    secondsDisplay?: "always" | "auto";
    milliseconds?: "long" | "short" | "narrow" | "numeric" | "2-digit";
    millisecondsDisplay?: "always" | "auto";
    microseconds?: "long" | "short" | "narrow" | "numeric" | "2-digit";
    microsecondsDisplay?: "always" | "auto";
    nanosecond?: "long" | "short" | "narrow" | "numeric" | "2-digit";
    nanosecondDisplay?: "always" | "auto";
    fractionalDigits?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  }

  /**
   * The duration object to be formatted
   *
   * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DurationFormat/format#duration).
   */
  type DurationType = AtLeastOne<Record<DurationTimeFormatUnit, number>>;

  interface DurationFormat {
    /**
     * @param duration The duration object to be formatted. It should include some or all of the following properties: months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds.
     *
     * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DurationFormat/format).
     */
    // eslint-disable-next-line @typescript-eslint/method-signature-style
    format(duration: DurationType): string;
    /**
     * @param duration The duration object to be formatted. It should include some or all of the following properties: months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds.
     *
     * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DurationFormat/formatToParts).
     */
    // eslint-disable-next-line @typescript-eslint/method-signature-style
    formatToParts(duration: DurationType): DurationFormatPart;
    /**
     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DurationFormat/resolvedOptions).
     */
    // eslint-disable-next-line @typescript-eslint/method-signature-style
    resolvedOptions(): ResolvedDurationFormatOptions;
  }

  const DurationFormat: {
    prototype: DurationFormat;

    /**
     * @param locales A string with a BCP 47 language tag, or an array of such strings.
     *   For the general form and interpretation of the `locales` argument, see the [Intl](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#locale_identification_and_negotiation)
     *   page.
     *
     * @param options An object for setting up a duration format.
     *
     * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DurationFormat/DurationFormat).
     */
    new (
      locales?: LocalesArgument,
      options?: DurationFormatOptions,
    ): DurationFormat;

    /**
     * Returns an array containing those of the provided locales that are supported in display names without having to fall back to the runtime's default locale.
     *
     * @param locales A string with a BCP 47 language tag, or an array of such strings.
     *   For the general form and interpretation of the `locales` argument, see the [Intl](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#locale_identification_and_negotiation)
     *   page.
     *
     * @param options An object with a locale matcher.
     *
     * @returns An array of strings representing a subset of the given locale tags that are supported in display names without having to fall back to the runtime's default locale.
     *
     * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DurationFormat/supportedLocalesOf).
     */
    // eslint-disable-next-line @typescript-eslint/method-signature-style
    supportedLocalesOf(
      locales?: LocalesArgument,
      options?: { localeMatcher?: LocaleMatcher },
    ): UnicodeBCP47LocaleIdentifier[];
  };
}
