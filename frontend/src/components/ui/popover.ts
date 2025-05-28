import { localized } from "@lit/localize";
import SlTooltip from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.component.js";
import slTooltipStyles from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.styles.js";
import { css } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * @attr {String} content
 * @attr {String} placement
 * @attr {String} trigger
 * @attr {Boolean} open
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
        --btrix-border: 1px solid var(--sl-panel-border-color);
        --sl-tooltip-background-color: var(--sl-color-neutral-50);
        --sl-tooltip-color: var(--sl-color-neutral-700);
      }

      ::part(body) {
        border: var(--btrix-border);
        box-shadow: var(--sl-shadow-small), var(--sl-shadow-medium);
      }

      ::part(arrow) {
        z-index: 1;
      }

      [placement="bottom"]::part(arrow),
      [placement="left"]::part(arrow) {
        border-top: var(--btrix-border);
      }

      [placement="bottom"]::part(arrow),
      [placement="right"]::part(arrow) {
        border-left: var(--btrix-border);
      }

      [placement="top"]::part(arrow),
      [placement="right"]::part(arrow) {
        border-bottom: var(--btrix-border);
      }

      [placement="top"]::part(arrow),
      [placement="left"]::part(arrow) {
        border-right: var(--btrix-border);
      }
    `,
  ];
}
