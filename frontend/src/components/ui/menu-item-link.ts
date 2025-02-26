import { localized } from "@lit/localize";
import type { SlDropdown } from "@shoelace-style/shoelace";
import menuItemStyles from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.styles.js";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import { NavigateController } from "@/controllers/navigate";

/**
 * Enables `href` on menu items
 * See https://github.com/shoelace-style/shoelace/discussions/1629
 *
 * Based on https://github.com/shoelace-style/shoelace/blob/d0b71adb81e21687a5ef036565dad44bc609bcce/src/components/menu-item/menu-item.component.ts
 */
@customElement("btrix-menu-item-link")
@localized()
export class MenuItemLink extends TailwindElement {
  static styles = [menuItemStyles];

  @property({ type: String })
  href = "";

  @property({ type: Boolean })
  download: boolean | string = false;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  loading = false;

  private readonly navigate = new NavigateController(this);

  render() {
    return html`<a
      href=${this.href}
      id="anchor"
      part="base"
      class=${classMap({
        "menu-item": true,
        "menu-item--disabled": this.disabled,
        "menu-item--loading": this.loading,
      })}
      download=${this.download}
      aria-disabled=${this.disabled}
      @click=${(e: MouseEvent) => {
        if (this.disabled || this.loading) {
          e.preventDefault();
          return;
        }

        if (this.download) {
          const dropdown = this.shadowRoot!.host.closest<
            SlDropdown | OverflowDropdown
          >("sl-dropdown, btrix-overflow-dropdown");

          if (dropdown) {
            void dropdown.hide();
          }
        } else {
          this.navigate.link(e);
        }
      }}
    >
      <span part="checked-icon" class="menu-item__check">
        <sl-icon name="check" library="system" aria-hidden="true"></sl-icon>
      </span>
      <slot name="prefix" part="prefix" class="menu-item__prefix"></slot>
      <slot part="label" class="menu-item__label"></slot>
      <slot name="suffix" part="suffix" class="menu-item__suffix"></slot>
      <span part="submenu-icon" class="menu-item__chevron">
        <!-- This also functions as a spacer in sl-menu-item -->
      </span>
      ${this.loading ? html` <sl-spinner part="spinner"></sl-spinner> ` : ""}
    </a>`;
  }
}
