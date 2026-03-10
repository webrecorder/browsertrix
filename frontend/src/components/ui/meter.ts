import { css, html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import debounce from "lodash/fp/debounce";

import { TailwindElement } from "@/classes/TailwindElement";
import type { UnderlyingFunction } from "@/types/utils";
import { tw } from "@/utils/tailwind";

@customElement("btrix-meter-bar")
export class MeterBar extends TailwindElement {
  /* Percentage of value / max */
  @property({ type: Number })
  value = 0;

  @property({ type: String })
  placement: "top" | "bottom" = "top";

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("value")) {
      this.style.width = `${this.value}%`;
      if (this.value <= 0) {
        this.style.display = "none";
      } else {
        this.style.display = "";
      }
    }
  }

  // postcss-lit-disable-next-line
  static styles = css`
    :host {
      display: block;
      --background-color: var(--background-color, var(--sl-color-blue-500));
      overflow: hidden;
      transition: box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
      min-width: 4px;
      transition: 400ms width;
    }

    .bar {
      height: 1rem;
      background-color: var(--background-color);
    }
  `;

  render() {
    if (this.value <= 0) {
      return;
    }
    return html`<btrix-floating-popover placement=${this.placement}>
      <div slot="content"><slot></slot></div>
      <div class="bar" part="bar"></div>
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

  @property({ type: Boolean })
  hasBackground = false;

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

    .valueBar {
      box-shadow: var(--sl-shadow-medium);
    }

    .valueBar:after,
    .track:after {
      content: "";
      position: absolute;
      top: 100%;
      right: 0;
      width: 1px;
      height: 6px;
      background-color: var(--sl-color-neutral-400);
      pointer-events: none;
      z-index: -1;
    }

    .valueBar[data-empty]::after {
      right: unset;
      left: 0;
    }

    .valueBar,
    .background {
      display: flex;
      border-radius: var(--sl-border-radius-medium);
      transition: 400ms width;
      position: relative;
    }

    .valueBar::before,
    .background::before {
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

    .valueBar::before {
      z-index: 1;
    }

    .labels {
      display: flex;
      text-align: right;
      white-space: nowrap;
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
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

    .valueBar ::slotted(btrix-meter-bar) {
      position: relative;
      transition-property: box-shadow, opacity;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 1px;
      --darkened-background-color-1: oklch(
        from var(--background-color) calc(l - 0.2) c h
      );
      --darkened-background-color-2: oklch(
        from var(--background-color) calc(l - 0.1) calc(c + 0.1) h / 0.5
      );
    }

    .valueBar ::slotted(btrix-meter-bar):after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: var(--sl-color-neutral-100);
      opacity: 0;
      transition-property: opacity;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
    }

    .valueBar:hover ::slotted(btrix-meter-bar:not(:hover)):after {
      opacity: 0.5;
    }

    .valueBar:hover ::slotted(btrix-meter-bar:hover) {
      box-shadow:
        0 0 0 1px var(--darkened-background-color-1),
        0 1px 3px 0 var(--darkened-background-color-2),
        0 1px 2px -1px var(--darkened-background-color-2);
      z-index: 1;
    }

    .background {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 1rem;
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .valueBar ::slotted(btrix-meter-bar:first-of-type),
    .valueBar ::slotted(btrix-meter-bar:first-of-type):after,
    .valueBar:hover ::slotted(btrix-meter-bar:first-of-type) {
      border-top-left-radius: var(--sl-border-radius-medium);
      border-bottom-left-radius: var(--sl-border-radius-medium);
    }
    .valueBar ::slotted(btrix-meter-bar:last-of-type),
    .valueBar ::slotted(btrix-meter-bar:last-of-type):after,
    .valueBar:hover ::slotted(btrix-meter-bar:last-of-type) {
      border-top-right-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
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
            ${this.hasBackground
              ? html`<div class="background">
                  <slot name="background"></slot>
                </div>`
              : null}
            <div
              class="valueBar"
              style="width:${barWidth}"
              ?data-empty=${this.value === 0}
            >
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
                <span class="maxText">
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
