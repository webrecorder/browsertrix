import { LitElement, html, css, PropertyValues } from "lit";
import { property, query, state } from "lit/decorators.js";
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
  min = 0;
  @property({ type: Number })
  max = 1;

  @property({ type: Number })
  value = 0;

  @property({ type: Number })
  high?: number;

  @property({ type: String })
  valueText?: string;

  @property({ type: String })
  valueLabel?: string;

  @property({ type: String })
  maxLabel?: string;

  @state()
  private showCompactLabels = false;

  @query(".bar")
  private bar?: HTMLElement;

  @query(".max-text")
  private maxText?: HTMLElement;

  static styles = css`
    .meter {
      position: relative;
    }

    .track {
      display: flex;
      height: 1rem;
      border-radius: var(--sl-border-radius-medium);
      background-color: var(--sl-color-neutral-100);
      box-shadow: inset 0px 1px 1px 0px rgba(0, 0, 0, 0.25);
    }

    .bar {
      height: 1rem;
      border-radius: var(--sl-border-radius-medium);
    }

    .bar.default {
      background-color: var(--sl-color-blue-500);
    }

    .bar.danger {
      background-color: var(--sl-color-red-500);
    }

    .labels {
      display: flex;
      text-align: right;
      white-space: nowrap;
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
      font-family: var(--font-monostyle-family);
      font-variation-settings: var(--font-monostyle-variation);
      line-height: 1;
      margin-top: var(--sl-spacing-x-small);
    }

    .label.max {
      flex-grow: 1;
    }

    .max-text {
      display: inline-block;
    }
  `;

  firstUpdated() {
    this.repositionLabels();
  }

  render() {
    const barWidth = `${Math.min(100, (this.value / this.max) * 100)}%`;
    return html`
      <div
        class="meter"
        role="${"meter" as any}"
        aria-valuenow=${this.value}
        aria-valuetext=${ifDefined(this.valueText)}
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
      >
        <sl-resize-observer @sl-resize=${this.onTrackResize}>
          <div class="track">
            <div
              class="bar ${this.value >= (this.high || this.max)
                ? "danger"
                : "default"}"
              style="width:${barWidth}"
            ></div>
          </div>
        </sl-resize-observer>
        <div class="labels">
          ${!this.showCompactLabels
            ? html`<div class="label value" style="width:${barWidth}">
                ${this.valueLabel || this.value}
              </div>`
            : ""}
          <div class="label max">
            ${this.showCompactLabels
              ? html`${this.valueLabel || this.value} /`
              : ""}
            <span class="max-text">${this.maxLabel || this.max}</span>
          </div>
        </div>
      </div>
    `;
  }

  private onTrackResize(e: CustomEvent) {
    const { entries } = e.detail;
    const entry = entries[0];
    const trackWidth = entry.contentBoxSize[0].inlineSize;
    this.repositionLabels(trackWidth);
  }

  private repositionLabels(trackWidth?: number) {
    if (!this.bar) return;
    const trackW = trackWidth || this.bar.closest(".track")?.clientWidth;
    if (!trackW) return;
    const barWidth = this.bar.clientWidth;
    const pad = 8;
    const remaining = Math.ceil(trackW - barWidth - pad);

    // Show compact value/max label when almost touching
    this.showCompactLabels = Boolean(
      this.maxText && this.maxText.clientWidth >= remaining
    );
  }
}
