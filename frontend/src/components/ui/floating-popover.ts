import { type VirtualElement } from "@shoelace-style/shoelace/dist/components/popup/popup.component.js";
import SlTooltip from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.component.js";
import slTooltipStyles from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.styles.js";
import { css } from "lit";
import { customElement, property } from "lit/decorators.js";

// import { watch } from "@shoelace-style/shoelace/dist/utilities/";

/**
 * Floating popovers are used to show labels and additional details in data visualizations.
 * They're hidden until hover, and follow the cursor within the anchor element.
 *
 * @attr {String} content
 * @attr {String} placement
 * @attr {String} distance
 * @attr {String} trigger
 * @attr {Boolean} open
 * @attr {Boolean} disabled
 */
@customElement("btrix-floating-popover")
export class FloatingPopover extends SlTooltip {
  @property({ type: Boolean, reflect: true })
  hoist = true;

  @property({ type: String, reflect: true })
  placement: SlTooltip["placement"] = "bottom";

  clientX: number | null = 0;
  clientY: number | null = 0;

  get anchor(): VirtualElement {
    return {
      getBoundingClientRect: () => {
        return new DOMRect(this.clientX ?? 0, this.clientY ?? 0, 0, 0);
      },
    };
  }

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

  // override render() {
  //   return html`
  //     <sl-popup
  //       part="base"
  //       exportparts="
  //             popup:base__popup,
  //             arrow:base__arrow
  //           "
  //       class=${classMap({
  //         tooltip: true,
  //         "tooltip--open": this.open,
  //       })}
  //       placement=${this.placement}
  //       distance=${this.distance}
  //       skidding=${this.skidding}
  //       strategy=${this.hoist ? "fixed" : "absolute"}
  //       flip
  //       shift
  //       arrow
  //       .anchor=${this.anchor}
  //     >
  //       ${""}
  //       <slot slot="anchor" aria-describedby="tooltip"></slot>

  //       ${""}
  //       <div
  //         part="body"
  //         id="tooltip"
  //         class="tooltip__body"
  //         role="tooltip"
  //         aria-live=${this.open ? "polite" : "off"}
  //       >
  //         <slot name="content">${this.content}</slot>
  //       </div>
  //     </sl-popup>
  //   `;
  // }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("mouseenter", this.handleMouseEnter);
    this.addEventListener("mouseleave", this.handleMouseLeave);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.body.removeEventListener("mousemove", this.handleMouseMove);
    this.removeEventListener("mouseenter", this.handleMouseEnter);
    this.removeEventListener("mouseleave", this.handleMouseLeave);
  }

  @watch(["content", "distance", "hoist", "placement", "skidding"])
  async handleOptionsChange() {
    if (this.hasUpdated) {
      await this.updateComplete;
      this.popup.reposition();
    }
  }

  handleMouseMove(event: MouseEvent) {
    this.clientX = event.clientX;
    this.clientY = event.clientY;

    console.log("mousemove", this.clientX, this.clientY, this.popup);
    // this.querySelector("sl-popup").reposition();
  }

  handleMouseLeave() {
    document.body.removeEventListener("mousemove", this.handleMouseMove);

    this.open = false;
  }

  handleMouseEnter(event: MouseEvent) {
    document.body.addEventListener("mousemove", this.handleMouseMove);
    this.clientX = event.clientX;
    this.clientY = event.clientY;

    this.open = true;
  }
}
