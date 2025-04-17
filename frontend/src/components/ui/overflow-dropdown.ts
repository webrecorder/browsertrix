import { localized, msg } from "@lit/localize";
import type { SlDropdown, SlMenu } from "@shoelace-style/shoelace";
import { html } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * Dropdown for additional actions.
 *
 * Usage:
 * ```ts
 * <btrix-overflow-dropdown>
 *   <sl-menu>
 *     <sl-menu-item>Item 1</sl-menu-item>
 *     <sl-menu-item>Item 2</sl-menu-item>
 *   </sl-menu>
 *< /btrix-overflow-dropdown>
 * ```
 */
@customElement("btrix-overflow-dropdown")
@localized()
export class OverflowDropdown extends TailwindElement {
  @property({ type: Boolean })
  raised = false;

  @property({ type: String })
  size?: "x-small" | "small" | "medium";

  @state()
  private hasMenuItems?: boolean;

  @query("sl-dropdown")
  private readonly dropdown?: SlDropdown;

  @queryAssignedElements({ selector: "sl-menu", flatten: true })
  private readonly menu!: SlMenu[];

  render() {
    return html`
      <sl-dropdown
        ?disabled=${!this.hasMenuItems}
        hoist
        distance=${ifDefined(this.raised ? "4" : undefined)}
      >
        <btrix-button slot="trigger" ?raised=${this.raised} size=${this.size}>
          <sl-icon
            label=${msg("Actions")}
            name="three-dots-vertical"
            class="size-4 text-base leading-none"
          ></sl-icon>
        </btrix-button>

        <slot
          @slotchange=${() => (this.hasMenuItems = this.menu.length > 0)}
        ></slot>
      </sl-dropdown>
    `;
  }

  hide() {
    void this.dropdown?.hide();
  }
}
