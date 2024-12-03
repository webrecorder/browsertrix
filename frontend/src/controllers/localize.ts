import { LocalizeController as SlLocalizeController } from "@shoelace-style/localize";
import type { Options as PrettyMsOptions } from "pretty-ms";

import localize from "@/utils/localize";
import roundDuration from "@/utils/round-duration";

export class LocalizeController extends SlLocalizeController {
  /**
   * Custom number formatter that uses ordinals
   */
  readonly number = localize.number;

  /**
   * Custom date formatter that takes missing `Z` into account
   */
  readonly date = localize.date;

  /**
   * Custom duration formatter
   */
  readonly duration = localize.duration;

  readonly humanizeDuration = (value: number, options?: PrettyMsOptions) => {
    const duration = roundDuration(value, options);

    if (options?.verbose) {
      return localize.duration(duration, { style: "long" });
    }
    return localize.duration(duration);
  };

  /**
   * From https://github.com/shoelace-style/shoelace/blob/v2.18.0/src/components/format-bytes/format-bytes.component.ts
   */
  readonly bytes = (value: number, options?: Intl.NumberFormatOptions) => {
    if (isNaN(value)) {
      return "";
    }

    const opts: Intl.NumberFormatOptions = {
      unit: "byte",
      unitDisplay: "short",
      ...options,
    };
    const bitPrefixes = ["", "kilo", "mega", "giga", "tera"]; // petabit isn't a supported unit
    const bytePrefixes = ["", "kilo", "mega", "giga", "tera", "peta"];
    const prefix = opts.unit === "bit" ? bitPrefixes : bytePrefixes;
    const index = Math.max(
      0,
      Math.min(Math.floor(Math.log10(value) / 3), prefix.length - 1),
    );
    const unit = prefix[index] + opts.unit;
    const valueToFormat = parseFloat(
      (value / Math.pow(1000, index)).toPrecision(3),
    );

    return localize.number(valueToFormat, {
      style: "unit",
      unit,
      unitDisplay: opts.unitDisplay,
    });
  };
}
