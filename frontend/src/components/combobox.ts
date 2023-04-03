import { LitElement, html, css } from "lit";
import { state, property, query } from "lit/decorators.js";
import {
  SlInput,
  SlMenu,
  SlMenuItem,
  SlPopup,
  SlTag,
} from "@shoelace-style/shoelace";

import { dropdown } from "../utils/css";

/**
 * Input that opens a popup of autocomplete options
 *
 * Usage:
 * ```ts
 * ```
 *
 * @event request-close
 */
export class Combobox extends LitElement {
  static styles = [
    dropdown,
    css`
      :host {
        position: relative;
        z-index: 2;
      }
    `,
  ];

  @property({ type: Boolean })
  open = false;

  @state()
  isActive = true;

  @query("#dropdown")
  private dropdown?: HTMLDivElement;

  @query("sl-menu")
  private menu?: SlMenu;

  @query("sl-popup")
  private combobox?: SlPopup;

  protected willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("open")) {
      if (this.open) {
        this.openDropdown();
      } else {
        this.closeDropdown();
      }
    }
  }

  render() {
    return html`
      <sl-popup
        placement="bottom-start"
        shift
        sync="width"
        strategy="fixed"
        ?active=${this.isActive}
      >
        <div slot="anchor" @focusout=${this.onFocusout}>
          <slot></slot>
        </div>
        <div
          id="dropdown"
          class="dropdown hidden"
          @animationend=${(e: AnimationEvent) => {
            const el = e.target as HTMLDivElement;
            if (e.animationName === "dropdownShow") {
              el.classList.remove("animateShow");
            }
            if (e.animationName === "dropdownHide") {
              el.classList.add("hidden");
              el.classList.remove("animateHide");
              this.isActive = false;
            }
          }}
        >
          <sl-menu role="listbox">
            <slot name="menu-item"></slot>
          </sl-menu>
        </div>
      </sl-popup>
    `;
  }

  private async onFocusout(e: FocusEvent) {
    const currentTarget = e.currentTarget as HTMLDivElement;
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (
      this.open &&
      (!relatedTarget || !currentTarget.contains(relatedTarget))
    ) {
      await this.updateComplete;
      this.dispatchEvent(new CustomEvent("request-close"));
    }
  }

  private async openDropdown() {
    this.isActive = true;
    await this.combobox?.updateComplete;
    this.dropdown?.classList.add("animateShow");
    this.dropdown?.classList.remove("hidden");
  }

  private closeDropdown() {
    this.dropdown?.classList.add("animateHide");
  }
}
