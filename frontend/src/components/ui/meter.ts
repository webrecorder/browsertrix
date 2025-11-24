import { css, html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";

import { TailwindElement } from "@/classes/TailwindElement";
import type { UnderlyingFunction } from "@/types/utils";
import { tw } from "@/utils/tailwind";

@customElement("btrix-meter-bar")
export class MeterBar extends TailwindElement {
  /* Percentage of value / max */
  @property({ type: Number })
  value = 0;

  // postcss-lit-disable-next-line
  static styles = css`
    :host {
      display: contents;
    }

    .bar {
      height: 1rem;
      background-color: var(--background-color, var(--sl-color-blue-500));
      min-width: 4px;
      transition: 400ms width;
    }
  `;

  render() {
    if (this.value <= 0) {
      return;
    }
    return html`<btrix-floating-popover placement="top">
      <div slot="content"><slot></slot></div>
      <div class="bar" style="width:${this.value}%"></div>
    </btrix-floating-popover>`;
  }
}

@customElement("btrix-divided-meter-bar")
export class DividedMeterBar extends TailwindElement {
  /* Percentage of value / max */
  @property({ type: Number })
  value = 0;

  @property({ type: Number })
  quota = 0;

  static styles = css`
    :host {
      display: contents;
    }

    .bar {
      height: 1rem;
      background-color: var(--background-color, var(--sl-color-blue-400));
      min-width: 4px;
    }

    .rightBorderRadius {
      border-top-right-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
    }

    .quotaBar {
      height: 1rem;
      background-color: var(--quota-background-color, var(--sl-color-blue-100));
      min-width: 4px;
    }
  `;

  render() {
    return html`<btrix-floating-popover placement="top">
      <div slot="content"><slot></slot></div>
      <div class="quotaBar" style="width:${this.quota}%" part="quotaBar">
        ${when(this.value, () => {
          return html`<div
            class="bar ${classMap({
              rightBorderRadius: this.value < this.quota,
            })}"
            part="bar"
            style="width:${(this.value / this.quota) * 100}%"
          ></div>`;
        })}
      </div>
    </btrix-floating-popover>`;
  }
}

/**
 * Show scalar value within a range
 *
 * Usage example:
 * ```ts
 * <btrix-meter max="50" value="40" low="10"></btrix-meter>
 * ```
 */
@customElement("btrix-meter")
export class Meter extends TailwindElement {
  @property({ type: Number })
  min = 0;

  @property({ type: Number })
  max?: number;

  @property({ type: Number })
  value = 0;

  @property({ type: String })
  valueText?: string;

  @query(".labels")
  private readonly labels?: HTMLElement;

  @query(".valueBar")
  private readonly valueBar?: HTMLElement;

  @query(".maxText")
  private readonly maxText?: HTMLElement;

  @queryAssignedElements({ slot: "valueLabel" })
  private readonly valueLabel!: HTMLElement[];

  // postcss-lit-disable-next-line
  static styles = css`
    :host {
      display: block;
    }

    .meter {
      position: relative;
      width: 100%;
    }

    .track {
      display: flex;
      height: 1rem;
      border-radius: var(--sl-border-radius-medium);
      background-color: var(--sl-color-neutral-100);
      box-shadow: inset 0 0 0 1px var(--sl-color-neutral-300);
      position: relative;
    }

    .track::before {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: var(--sl-border-radius-medium);
      content: "";
      box-shadow: inset 0 0 0 1px var(--sl-panel-border-color);
      pointer-events: none;
    }

    .valueBar {
      display: flex;
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
      transition: 400ms width;
      position: relative;
    }

    .valueBar::before {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: var(--sl-border-radius-medium);
      content: "";
      box-shadow: inset 0 0 0 1px var(--sl-color-neutral-500);
      mix-blend-mode: color-burn;
      pointer-events: none;
    }

    .track:hover > * {
      opacity: 0.5;
    }

    .track:hover > *:hover {
      opacity: 1;
    }

    .valueBar:hover ::slotted(*) {
      opacity: 0.5;
    }

    .valueBar:hover ::slotted(*):hover {
      opacity: 1;
    }

    .labels {
      display: flex;
      text-align: right;
      white-space: nowrap;
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
      /*font-family: var(--font-monostyle-family);*/
      /*font-variation-settings: var(--font-monostyle-variation);*/
      line-height: 1;
      margin-top: var(--sl-spacing-x-small);
    }

    .label.max {
      flex-grow: 1;
    }

    .valueText {
      display: inline-block;
    }

    .maxText.withSeparator:before {
      content: "/";
      padding: 0 0.3ch;
    }

    .maxText {
      display: inline-flex;
    }

    ::slotted(*) ::slotted(*) {
      border-top-left-radius: var(--sl-border-radius-medium);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      transform: scale(30);
    }
  `;

  @queryAssignedElements({ selector: "btrix-meter-bar" })
  bars?: HTMLElement[];

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("value") || changedProperties.has("max")) {
      this.repositionLabels();
    }
  }

  firstUpdated() {
    // TODO refactor to check slot
    if (!this.valueLabel.length) {
      this.labels?.classList.add(tw`hidden`);
    }
  }

  render() {
    // meter spec disallow values that exceed max
    const max = this.max ? Math.max(this.value, this.max) : this.value;
    const boundedValue = Math.max(Math.min(this.value, max), this.min);
    const barWidth = `${(boundedValue / max) * 100}%`;
    return html`
      <div
        class="meter"
        role="${
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "meter" as any
        }"
        aria-valuenow=${boundedValue}
        aria-valuetext=${ifDefined(this.valueText)}
        aria-valuemin=${this.min}
        aria-valuemax=${max}
      >
        <sl-resize-observer
          @sl-resize=${this.onTrackResize as UnderlyingFunction<
            typeof this.onTrackResize
          >}
        >
          <div class="track">
            <div class="valueBar" style="width:${barWidth}">
              <slot @slotchange=${this.handleSlotchange}></slot>
            </div>
            ${this.value < max ? html`<slot name="available"></slot>` : ""}
          </div>
        </sl-resize-observer>
        <div class="labels">
          <div class="label value" style="width:${barWidth}">
            <span class="valueText">
              <slot name="valueLabel"></slot>
            </span>
          </div>
          ${this.max
            ? html`<div class="label max">
                <span class="maxText withSeparator">
                  <slot name="maxLabel"></slot>
                </span>
              </div>`
            : ""}
        </div>
      </div>
    `;
  }

  private readonly onTrackResize = debounce(100)(
    (e: CustomEvent<{ entries: ResizeObserverEntry[] }>) => {
      const { entries } = e.detail;
      const entry = entries[0];
      const trackWidth = entry.contentBoxSize[0].inlineSize;
      this.repositionLabels(trackWidth);
    },
  );

  private repositionLabels(trackWidth?: number) {
    if (!this.valueBar || !this.maxText) return;
    const trackW = trackWidth || this.valueBar.closest(".track")?.clientWidth;
    if (!trackW) return;
    const barWidth = this.valueBar.clientWidth;
    const pad = 8;
    const remaining = Math.ceil(trackW - barWidth - pad);

    // Show compact value/max label when almost touching
    if (this.maxText.clientWidth >= remaining) {
      this.maxText.classList.add("withSeparator");
    } else {
      this.maxText.classList.remove("withSeparator");
    }
  }

  private handleSlotchange() {
    if (!this.bars) return;
    if (this.bars.length > 1) {
      this.bars.forEach((el, i, arr) => {
        if (i < arr.length - 1) {
          el.style.cssText +=
            "--border-right: 1px solid var(--sl-color-neutral-600)";
        }
      });
    }
  }
}
