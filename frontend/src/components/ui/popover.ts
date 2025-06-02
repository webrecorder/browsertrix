import { localized } from "@lit/localize";
import SlTooltip from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.component.js";
import slTooltipStyles from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.styles.js";
import { css } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Popovers are used to reveal supplementary information, like additional context or details.
 * They're hidden until an anchor is activated, e.g. on hover.
 *
 * Popovers should be used to convey information in full sentences or complex HTML.
 * To display titles, labels, and expand truncated text on hover, use `<sl-tooltip>`.
 *
 * @attr {String} content
 * @attr {String} placement
 * @attr {String} distance
 * @attr {String} trigger
 * @attr {Boolean} open
 * @attr {Boolean} disabled
 */
@customElement("btrix-popover")
@localized()
export class Popover extends SlTooltip {
  @property({ type: Boolean, reflect: true })
  hoist = true;

  @property({ type: String, reflect: true })
  placement: SlTooltip["placement"] = "bottom";

  static styles = [
    slTooltipStyles,
    css`
      :host {
        --btrix-border: 1px solid var(--sl-color-neutral-300);
        --sl-tooltip-border-radius: var(--sl-border-radius-large);
        --sl-tooltip-background-color: var(--sl-color-neutral-50);
        --sl-tooltip-color: var(--sl-color-neutral-700);
        --sl-tooltip-font-size: var(--sl-font-size-x-small);
        --sl-tooltip-padding: var(--sl-spacing-small);
        --sl-tooltip-line-height: var(--sl-line-height-dense);
      }

      .tooltip__body {
        border: var(--btrix-border);
        box-shadow: var(--sl-shadow-small), var(--sl-shadow-large);
      }

      ::part(arrow) {
        z-index: 1;
      }

      [data-current-placement^="bottom"]::part(arrow),
      [data-current-placement^="left"]::part(arrow) {
        border-top: var(--btrix-border);
      }

      [data-current-placement^="bottom"]::part(arrow),
      [data-current-placement^="right"]::part(arrow) {
        border-left: var(--btrix-border);
      }

      [data-current-placement^="top"]::part(arrow),
      [data-current-placement^="right"]::part(arrow) {
        border-bottom: var(--btrix-border);
      }

      [data-current-placement^="top"]::part(arrow),
      [data-current-placement^="left"]::part(arrow) {
        border-right: var(--btrix-border);
      }
    `,
  ];
}
