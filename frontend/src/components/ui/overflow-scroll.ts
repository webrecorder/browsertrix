import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Overflow scroller. Optionally displays a scrim/shadow (a small gradient
 * indicating there's more available content) on supported browsers,
 * depending on scroll position.
 * @cssproperty --btrix-overflow-scrim-width The width of the scrim. 3rem by default.
 * @cssproperty --btrix-overflow-scroll-scrim-color The color of the scrim. White by default.
 */
@customElement("btrix-overflow-scroll")
export class OverflowDropdown extends LitElement {
  /**
   * The direction of the overflow scroll. Currently just horizontal.
   */
  // TODO: Implement vertical overflow scroller
  @property({ type: String })
  // eslint-disable-next-line @typescript-eslint/prefer-as-const
  direction: "horizontal" = "horizontal";

  /**
   * Whether to show a scrim when the overflow scroll is active.
   * Progressive enhancement: only works on Chromium-based browsers currently.
   * See https://caniuse.com/mdn-css_properties_scroll-timeline for support.
   */
  @property({ type: Boolean })
  scrim = true;

  static styles = css`
    :host {
      display: block;
      position: relative;
    }

    [direction="horizontal"] {
      overflow-x: auto;
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
        z-index: 1;
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
      class="btrix-overflow-scroll"
      direction=${this.direction}
      ?scrim=${this.scrim}
      part="content"
    >
      <slot></slot>
    </div>`;
  }
}
