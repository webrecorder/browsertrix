import { LocalizeController as SlLocalizeController } from "@shoelace-style/localize";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import type { Options as PrettyMsOptions } from "pretty-ms";

import localize from "@/utils/localize";
import roundDuration from "@/utils/round-duration";
import { tw } from "@/utils/tailwind";

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
   * Custom relative date formatter that also renders tooltip
   */
  readonly relativeDate = (
    dateStr: string,
    { prefix, capitalize }: { prefix?: string; capitalize?: boolean } = {},
  ) => {
    const date = new Date(dateStr);
    const diff = new Date().getTime() - date.getTime();
    const seconds = diff / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;

    return html`
      <sl-tooltip
        content=${this.date(date, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          timeZoneName: "short",
          weekday: "long",
        })}
        hoist
        placement="bottom"
      >
        <span>
          ${prefix}
          ${hours > 24
            ? this.date(date, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : seconds > 60
              ? html`<sl-relative-time
                  class=${ifDefined(capitalize ? tw`capitalize` : undefined)}
                  sync
                  date=${dateStr}
                ></sl-relative-time>`
              : `<${this.relativeTime(-1, "minute", { style: "narrow" })}`}
        </span>
      </sl-tooltip>
    `;
  };

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
