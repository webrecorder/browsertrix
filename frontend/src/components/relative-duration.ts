import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import humanizeDuration from "pretty-ms";

/**
 * Show time passed from date in human-friendly format
 *
 * Usage example:
 * ```ts
 * <btrix-relative-duration value=${value}></btrix-relative-duration>
 * ```
 *
 * @event on-copied
 */
export class RelativeDuration extends LitElement {
  @property({ type: String })
  value?: string; // `new Date` compatible date format

  static humanize(duration: number) {
    return humanizeDuration(duration, {
      secondsDecimalDigits: 0,
    });
  }

  render() {
    if (!this.value) return "";

    return RelativeDuration.humanize(
      Date.now() - new Date(this.value).valueOf()
    );
  }
}
