import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import humanizeDuration from "pretty-ms";

export type HumanizeOptions = {
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
  tickSeconds?: number; // Enables ticks every specified seconds

  @property({ type: Number })
  endTime?: number = Date.now();

  @property({ type: Boolean })
  compact? = false;

  @property({ type: Boolean })
  verbose? = false;

  @property({ type: Number })
  unitCount?: number;

  @state()
  private timerId?: number;

  static humanize(duration: number, options: HumanizeOptions = {}) {
    return humanizeDuration(duration, {
      secondsDecimalDigits: 0,
      ...options,
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    window.clearTimeout(this.timerId);
    super.disconnectedCallback();
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>) {
    const durationChanged =
      changedProperties.has("value") || changedProperties.has("endTime");

    if (changedProperties.has("tickSeconds") || durationChanged) {
      window.clearTimeout(this.timerId);
    }
    if (this.tickSeconds && durationChanged) {
      this.tick(this.tickSeconds * 1000);
    }
  }

  private tick(timeoutMs: number) {
    this.timerId = window.setTimeout(() => {
      this.endTime = Date.now();

      if (this.tickSeconds) {
        this.tick(this.tickSeconds * 1000);
      }
    }, timeoutMs);
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
