import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";
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
export class RelativeDuration extends LitElement {
  @property({ type: String })
  value?: string; // `new Date` compatible date format

  @state()
  private now = Date.now();

  // For long polling:
  private timerId?: number;

  static humanize(duration: number) {
    return humanizeDuration(duration, {
      secondsDecimalDigits: 0,
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
