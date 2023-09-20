import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

/**
 * Show scalar value within a range
 *
 * Usage example:
 * ```ts
 * <btrix-meter max="50" value="40" low="10" high="49"></btrix-meter>
 * ```
 */
export class Meter extends LitElement {
  @property({ type: Number })
  max = 1;

  @property({ type: Number })
  value = 0;

  @property({ type: Number })
  min?: number;

  @property({ type: Number })
  high?: number;

  static styles = css`
    meter {
      display: block;
      -moz-appearance: none;
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 1rem;
      border-radius: var(--sl-border-radius-medium);
    }

    meter,
    meter::-webkit-meter-bar {
      background: none;
      background-color: var(--sl-color-neutral-100);
      box-shadow: inset 0px 1px 1px 0px rgba(0, 0, 0, 0.25);
    }

    meter::-moz-meter-bar {
      background: none;
      background-color: var(--sl-color-blue-500);
      border-radius: var(--sl-border-radius-medium);
    }
    .value-bar {
      height: 1rem;
      background-color: var(--sl-color-blue-500);
      border-radius: var(--sl-border-radius-medium);
    }

    meter.danger .value-bar {
      background-color: var(--sl-color-red-500);
    }
    meter.danger::-moz-meter-bar {
      background-color: var(--sl-color-red-500);
    }
  `;

  render() {
    return html`
      <style></style>
      <meter
        class="${this.value >= (this.high || this.max) ? "danger" : ""}"
        value=${this.value}
        max=${this.max}
        min=${ifDefined(this.min)}
        high=${ifDefined(this.high)}
      >
        <div
          class="value-bar"
          style="width:${Math.min(100, (this.value / this.max) * 100)}%"
        ></div>
      </meter>
    `;
  }
}
