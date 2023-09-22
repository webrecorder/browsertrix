import { LitElement, html, css, PropertyValues } from "lit";
import { property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import debounce from "lodash/fp/debounce";

export class MeterBar extends LitElement {
  /* Percentage of value / max */
  @property({ type: Number })
  value = 0;

  static styles = css`
    :host {
      display: contents;
    }

    .bar {
      height: 1rem;
      background-color: var(--background-color, var(--sl-color-blue-500));
    }
  `;

  render() {
    return html`<sl-tooltip>
      <div slot="content"><slot></slot></div>
      <div class="bar" style="width:${this.value}%"></div>
    </sl-tooltip>`;
  }
}

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
  max = 100;

  @property({ type: Number })
  value = 0;

  @property({ type: Array })
  subValues?: number[];

  @property({ type: Number })
  high?: number;

  @property({ type: String })
  valueText?: string;

  @property({ type: String })
  valueLabel?: string;

  @property({ type: String })
  maxLabel?: string;

  @query(".valueBar")
  private valueBar?: HTMLElement;

  @query(".labels")
  private labels?: HTMLElement;

  @query(".maxText")
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

    .valueBar {
      display: flex;
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
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

    .valueText.withSeparator:after {
      content: "/";
      padding: 0 0.5ch;
    }

    .maxText {
      display: inline-block;
    }
  `;

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("value") || changedProperties.has("max")) {
      this.repositionLabels();
    }
  }

  render() {
    const boundedValue = Math.max(Math.min(this.value, this.max), this.min);
    const barWidth = `${(boundedValue / this.max) * 100}%`;
    return html`
      <div
        class="meter"
        role="meter"
        aria-valuenow=${boundedValue}
        aria-valuetext=${ifDefined(this.valueText)}
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
      >
        <sl-resize-observer @sl-resize=${this.onTrackResize}>
          <div class="track">
            <div class="valueBar" style="width:${barWidth}">
              <slot></slot>
            </div>
          </div>
        </sl-resize-observer>
        <div class="labels">
          <div class="label value" style="width:${barWidth}">
            <span class="valueText withSeparator"
              >${this.valueLabel || this.value}</span
            >
          </div>
          <div class="label max">
            <span class="maxText">${this.maxLabel || this.max}</span>
          </div>
        </div>
      </div>
    `;
  }

  private onTrackResize = debounce(100)((e: CustomEvent) => {
    const { entries } = e.detail;
    const entry = entries[0];
    const trackWidth = entry.contentBoxSize[0].inlineSize;
    this.repositionLabels(trackWidth);
  }) as any;

  private repositionLabels(trackWidth?: number) {
    if (!this.valueBar || !this.maxText) return;
    const trackW = trackWidth || this.valueBar.closest(".track")?.clientWidth;
    if (!trackW) return;
    const barWidth = this.valueBar.clientWidth;
    const pad = 8;
    const remaining = Math.ceil(trackW - barWidth - pad);

    // Show compact value/max label when almost touching
    const valueText = this.labels?.querySelector(".valueText");
    if (this.maxText && this.maxText.clientWidth >= remaining) {
      valueText?.classList.add("withSeparator");
    } else {
      valueText?.classList.remove("withSeparator");
    }
  }
}
