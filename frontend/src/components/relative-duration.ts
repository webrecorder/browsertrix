import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import humanizeDuration from "pretty-ms";

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

  static humanize(duration: number, options: any = {}) {
    const minMs = 60 * 1000;

    if (duration < minMs) {
      return msg(str`< 1 minute`, {
        desc: "Less than one minute",
      });
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
      }
    );
  }
}
