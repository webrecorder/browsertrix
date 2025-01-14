import { localized } from "@lit/localize";
import { LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { LocalizeController } from "@/controllers/localize";

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
@customElement("btrix-relative-duration")
@localized()
export class RelativeDuration extends LitElement {
  readonly localize = new LocalizeController(this);

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

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    window.clearTimeout(this.timerId);
    super.disconnectedCallback();
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has("tickSeconds")) {
      window.clearTimeout(this.timerId);
    }

    if (changedProperties.has("endTime") && this.tickSeconds) {
      this.tick(this.tickSeconds * 1000);
    }
  }

  private tick(timeoutMs: number) {
    window.clearTimeout(this.timerId);

    this.timerId = window.setTimeout(() => {
      this.endTime = Date.now();
    }, timeoutMs);
  }

  render() {
    if (!this.value) return "";

    const durationMs =
      (this.endTime || Date.now()) - new Date(this.value).valueOf();

    return this.localize.humanizeDuration(durationMs, {
      compact: this.compact,
      verbose: this.verbose,
      unitCount: this.unitCount,
    });
  }
}
