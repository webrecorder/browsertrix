import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-overflow-scroll")
export class OverflowDropdown extends TailwindElement {
  // TODO: Implement vertical overflow scroller
  @property({ type: String })
  // eslint-disable-next-line @typescript-eslint/prefer-as-const
  direction: "horizontal" = "horizontal";

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
        z-index: 10;
        top: 0;
        height: 100%;
        pointer-events: none;
        animation-name: scroll-indicator;
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
    }

    @keyframes scroll-indicator {
      0% {
        opacity: 0;
      }
      100% {
        opacity: 1;
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
