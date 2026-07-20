import clsx from "clsx";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * Overflow scroller. Optionally displays a scrim/shadow (a small gradient
 * indicating there's more available content) on supported browsers,
 * depending on scroll position.
 * @slot
 * @cssPart content
 * @cssproperty --btrix-overflow-scrim-width The width of the scrim. 3rem by default.
 * @cssproperty --btrix-overflow-scroll-scrim-color The color of the scrim. White by default.
 * @cssproperty --btrix-overflow-scroll-thumb-color The color of the thumb of the scrollbar.
 * @cssproperty --btrix-overflow-scroll-track-color The color of the track of the scrollbar.
 */
@customElement("btrix-overflow-scroll")
export class OverflowScroll extends TailwindElement {
  /**
   * The direction of the overflow scroll. Currently just horizontal.
   */
  // TODO: Implement vertical overflow scroller
  @property({ type: String })
  // eslint-disable-next-line @typescript-eslint/prefer-as-const
  direction: "horizontal" = "horizontal";

  /**
   * Whether to show a scrim when the overflow scroll is active. Only appears when the inner content is wider than this element.
   *
   * Progressive enhancement: only works on Chromium-based browsers currently.
   * See https://caniuse.com/mdn-css_properties_scroll-timeline for support.
   */
  @property({ type: Boolean })
  scrim = CSS.supports("scroll-timeline", "none");

  @property({ type: Boolean })
  hideScrollbar = false;

  static styles = css`
    :host {
      display: block;
      position: relative;
    }

    [direction="horizontal"] {
      overflow-x: auto;
    }

    .btrix-overflow-scroll {
      scrollbar-color: var(--btrix-overflow-scroll-thumb-color, auto)
        var(--btrix-overflow-scroll-track-color, auto);
    }

    @supports (scroll-timeline-name: --btrix-overflow-scroll-timeline) {
      [scrim][direction="horizontal"] {
        scroll-timeline-name: --btrix-overflow-scroll-timeline;
        scroll-timeline-axis: inline;
      }

      [scrim][direction="horizontal"]:before,
      [scrim][direction="horizontal"]:after {
        content: "";
        width: var(--btrix-overflow-scrim-width, 3rem);
        position: absolute;
        z-index: 10;
        top: 0;
        height: 100%;
        pointer-events: none;
        animation-name: btrix-scroll-scrim;
        animation-timeline: --btrix-overflow-scroll-timeline;
        opacity: 0;
      }

      [scrim][direction="horizontal"]:before {
        left: 0;
        background: linear-gradient(
          to right,
          var(--btrix-overflow-scroll-scrim-color, white),
          transparent
        );
        /* background-color: blue; */
      }
      [scrim][direction="horizontal"]:after {
        right: 0;
        background: linear-gradient(
          to right,
          transparent,
          var(--btrix-overflow-scroll-scrim-color, white)
        );
        /* background-color: blue; */
        animation-direction: reverse;
      }
      @keyframes btrix-scroll-scrim {
        0% {
          opacity: 0;
        }
        20% {
          opacity: 1;
        }
        100% {
          opacity: 1;
        }
      }
    }
  `;

  render() {
    return html`<div
      class=${clsx(
        "btrix-overflow-scroll",
        this.hideScrollbar && [
          this.scrim ? tw`[scrollbar-width:none]` : tw`[scrollbar-width:thin]`,
        ],
      )}
      direction=${this.direction}
      ?scrim=${this.scrim}
      part="content"
    >
      <slot></slot>
    </div>`;
  }
}
