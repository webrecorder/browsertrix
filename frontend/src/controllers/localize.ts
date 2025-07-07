import { LocalizeController as SlLocalizeController } from "@shoelace-style/localize";
import type { Options as PrettyMsOptions } from "pretty-ms";

import localize from "@/utils/localize";
import roundDuration from "@/utils/round-duration";

export class LocalizeController extends SlLocalizeController {
  /**
   * Custom number formatter
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

  readonly ordinal = localize.ordinal;

  readonly humanizeDuration = (value: number, options?: PrettyMsOptions) => {
    const duration = roundDuration(value, options);

    if (options?.colonNotation)
      return localize.duration(duration, { style: "digital" });

    if (options?.verbose) return localize.duration(duration, { style: "long" });

    return localize.duration(duration);
  };

  readonly bytes = localize.bytes;

  readonly list = localize.list;
}
