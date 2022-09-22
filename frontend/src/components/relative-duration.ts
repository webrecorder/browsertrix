import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import humanizeDuration from "pretty-ms";

/**
 * Show time passed from date in human-friendly format
 * Updates every 5 seconds
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

  @state()
  private now = Date.now();

  // For long polling:
  private timerId?: number;

  static humanize(duration: number, options: any = {}) {
    const minMs = 60 * 1000;

    if (duration < minMs) {
      return msg(str`< 1 minute`);
    }

    return humanizeDuration(duration, {
      secondsDecimalDigits: 0,
      ...options,
    });
  }

  connectedCallback(): void {
    super.connectedCallback();

    this.timerId = window.setInterval(() => this.updateValue(), 1000 * 5);
  }

  disconnectedCallback(): void {
    window.clearInterval(this.timerId);
    super.disconnectedCallback();
  }

  render() {
    if (!this.value) return "";

    return RelativeDuration.humanize(this.now - new Date(this.value).valueOf());
  }

  private updateValue() {
    this.now = Date.now();
  }
}
