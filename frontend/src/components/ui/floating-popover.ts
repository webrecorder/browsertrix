import { type VirtualElement } from "@shoelace-style/shoelace/dist/components/popup/popup.component.js";
import SlTooltip from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.component.js";
import slTooltipStyles from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.styles.js";
import { css, html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

export function parseDuration(delay: number | string) {
  delay = delay.toString().toLowerCase();

  if (delay.indexOf("ms") > -1) {
    return parseFloat(delay);
  }

  if (delay.indexOf("s") > -1) {
    return parseFloat(delay) * 1000;
  }

  return parseFloat(delay);
}

/**
 * Floating popovers are used to show labels and additional details in data visualizations.
 * They're hidden until hover, and follow the cursor within the anchor element.
 *
 * Importantly, they are not interactive and do not respond to user input via keyboard.
 * Their content will not be accessible to screen readers or other assistive technologies.
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

  @property({ type: String, reflect: true })
  lock: "x" | "y" | "x y" | "" = "y";

  clientX: number | null = 0;
  clientY: number | null = 0;

  isHovered = false;

  private get slottedChildren() {
    const slot = this.shadowRoot!.querySelector("slot");
    return slot?.assignedElements({ flatten: true });
  }

  get anchor(): VirtualElement {
    let originalRect: DOMRect | undefined;
    if (this.lock !== "") {
      originalRect = this.slottedChildren?.[0].getBoundingClientRect();
    }
    return {
      getBoundingClientRect: () => {
        return new DOMRect(
          (this.hasLock("x") ? originalRect?.x : this.clientX) ?? 0,
          (this.hasLock("y") ? originalRect?.y : this.clientY) ?? 0,
          0,
          0,
        );
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

      ::part(popup) {
        pointer-events: none;
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

  constructor() {
    super();
    this.addEventListener("mouseover", this._handleMouseOver);
    this.addEventListener("mouseout", this._handleMouseOut);
  }

  override render() {
    return html`
      <sl-popup
        part="base"
        exportparts="
              popup:base__popup,
              arrow:base__arrow
            "
        class=${classMap({
          tooltip: true,
          "tooltip--open": this.open,
        })}
        placement=${this.placement}
        distance=${this.distance}
        skidding=${this.skidding}
        strategy=${this.hoist ? "fixed" : "absolute"}
        flip
        shift
        arrow
        .anchor=${this.anchor}
      >
        ${""}
        <slot slot="anchor" aria-describedby="tooltip"></slot>

        ${""}
        <div
          part="body"
          id="tooltip"
          class="tooltip__body"
          role="tooltip"
          aria-live=${this.open ? "polite" : "off"}
        >
          <slot name="content">${this.content}</slot>
        </div>
      </sl-popup>
    `;
  }

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.body.removeEventListener("mousemove", this.handleMouseMove);
  }

  async handleOptionsChange() {
    if (this.hasUpdated) {
      await this.updateComplete;
      this.popup.reposition();
    }
  }

  hasChanged(changedProps: PropertyValues<this>) {
    if (
      (
        [
          "content",
          "distance",
          "hoist",
          "placement",
          "skidding",
        ] as (keyof FloatingPopover)[]
      ).some(changedProps.has)
    ) {
      void this.handleOptionsChange();
    }
  }

  handleMouseMove = (event: MouseEvent) => {
    if (this.isHovered) {
      this.clientX = event.clientX;
      this.clientY = event.clientY;
      this.popup.reposition();
    }
  };

  private readonly _handleMouseOver = (event: MouseEvent) => {
    if (this._hasTrigger("hover")) {
      this.isHovered = true;
      this.clientX = event.clientX;
      this.clientY = event.clientY;
      document.body.addEventListener("mousemove", this.handleMouseMove);
      const delay = parseDuration(
        getComputedStyle(this).getPropertyValue("--show-delay"),
      );
      // @ts-expect-error need to access SlTooltip's hoverTimeout
      clearTimeout(this.hoverTimeout as number | undefined);
      // @ts-expect-error need to access SlTooltip's hoverTimeout
      this.hoverTimeout = window.setTimeout(async () => this.show(), delay);
    }
  };

  private readonly _handleMouseOut = () => {
    if (this._hasTrigger("hover")) {
      this.isHovered = false;
      document.body.removeEventListener("mousemove", this.handleMouseMove);
      const delay = parseDuration(
        getComputedStyle(this).getPropertyValue("--hide-delay"),
      );
      // @ts-expect-error need to access SlTooltip's hoverTimeout
      clearTimeout(this.hoverTimeout as number | undefined);
      // @ts-expect-error need to access SlTooltip's hoverTimeout
      this.hoverTimeout = window.setTimeout(async () => this.hide(), delay);
    }
  };

  private readonly _hasTrigger = (triggerType: string) => {
    const triggers = this.trigger.split(" ");
    return triggers.includes(triggerType);
  };

  private readonly hasLock = (lockType: "x" | "y") => {
    const locks = this.lock.split(" ");
    return locks.includes(lockType);
  };
}
