import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import humanizeDuration from "pretty-ms";

type HumanizeOptions = {
  compact?: boolean;
  verbose?: boolean;
  unitCount?: number;
};

/**
 * Show time passed from date in human-friendly format
 *
 * Usage example:
 * ```ts
 * <btrix-relative-duration value=${value}></btrix-relative-duration>
 * ```
 */
@localized()
export class RelativeDuration extends LitElement {
  @property({ type: String })
  value?: string; // `new Date` compatible date format

  @property({ type: Number })
  endTime?: number; // Optional value to compare to

  @property({ type: Boolean })
  compact = false;

  @property({ type: Boolean })
  verbose = false;

  @property({ type: Number })
  unitCount?: number;

  static humanize(duration: number, options: HumanizeOptions = {}) {
    if (!options.verbose && duration < 10 * 1000) {
      return msg(str`< 10 seconds`, {
        desc: "Less than ten seconds",
      });
    }

    if (!options.verbose && options.unitCount === undefined) {
      // Show second unit if less than 2 min or greater than 1 hr
      if (duration >= 60 * 2 * 1000 || duration >= 60 * 60 * 1000) {
        options.unitCount = 2;
      } else {
        options.unitCount = 1;
      }
    }

    return humanizeDuration(duration, {
      secondsDecimalDigits: 0,
      ...options,
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  render() {
    if (!this.value) return "";

    return RelativeDuration.humanize(
      (this.endTime || Date.now()) - new Date(this.value).valueOf(),
      {
        compact: this.compact,
        verbose: this.verbose,
        unitCount: this.unitCount,
      }
    );
  }
}
