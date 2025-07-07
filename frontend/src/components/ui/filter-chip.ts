import { localized } from "@lit/localize";
import type { SlDropdown } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { focusable } from "tabbable";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { tw } from "@/utils/tailwind";

export type BtrixFilterChipChangeEvent = BtrixChangeEvent;

/**
 * A filter chip lets users select a content filter. If there's only one option, the chip toggles on and off.
 * Otherwise, clicking the chip reveals a dropdown menu of filter options.
 *
 * Filter chips are meant to be shown as multiple filter options, hence the plus (`+`) icon to indicate adding a filter.
 *
 * @slot
 * @slot dropdown-header
 * @slot dropdown-content
 *
 * @fires btrix-change
 */
@customElement("btrix-filter-chip")
@localized()
export class FilterChip extends TailwindElement {
  @property({ type: Boolean })
  checked?: boolean;

  @property({ type: Boolean })
  selectFromDropdown?: boolean;

  @property({ type: Boolean })
  stayOpenOnChange?: boolean;

  @property({ type: Boolean })
  open?: boolean;

  @query("sl-dropdown")
  private readonly dropdown?: SlDropdown | null;

  @queryAssignedElements({ slot: "dropdown-content" })
  private readonly dropdownContent!: HTMLElement[];

  render() {
    if (this.selectFromDropdown) {
      return html`
        <sl-dropdown
          distance="4"
          hoist
          ?stayOpenOnSelect=${this.stayOpenOnChange}
          class="group/dropdown"
          @sl-change=${() => {
            if (!this.stayOpenOnChange) {
              void this.dropdown?.hide();
            }
          }}
          ?open=${this.open}
          @keydown=${{ handleEvent: this.onKeyDown, capture: true }}
        >
          ${this.renderButton()}

          <div
            class="flex max-h-[var(--auto-size-available-height)] max-w-[var(--auto-size-available-width)] flex-col overflow-hidden rounded border bg-white text-left"
          >
            <header
              class="flex-shrink-0 flex-grow-0 overflow-hidden rounded-t bg-white"
            >
              <slot name="dropdown-header"></slot>
            </header>
            <slot name="dropdown-content"></slot>
          </div>
        </sl-dropdown>
      `;
    }

    return this.renderButton();
  }

  private renderButton() {
    return html`
      <sl-button
        slot=${ifDefined(this.selectFromDropdown ? "trigger" : undefined)}
        role="checkbox"
        aria-checked=${this.checked ? "true" : "false"}
        size="small"
        ?caret=${this.selectFromDropdown}
        outline
        pill
        class=${clsx([
          tw`part-[] part-[suffix]:-mr-0.5`,
          tw`hover:part-[base]:border-primary-300 hover:part-[base]:bg-transparent hover:part-[base]:text-primary-600`,
          tw`aria-checked:part-[base]:border-primary-300 aria-checked:part-[base]:bg-primary-50/80 aria-checked:part-[base]:text-primary-600`,
          tw`group-open/dropdown:part-[base]:border-primary-300 group-open/dropdown:part-[caret]:text-primary-600 group-open/dropdown:part-[label]:text-primary-600`,
        ])}
        @click=${this.onClick}
      >
        <sl-icon
          class="size-4 text-base group-open/dropdown:text-primary-600"
          slot="prefix"
          name=${this.checked ? "check2-circle" : "plus-circle-dotted"}
        ></sl-icon>
        <slot></slot>
      </sl-button>
    `;
  }

  private readonly onClick = () => {
    if (!this.selectFromDropdown) {
      this.toggleChecked();
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (
      this.selectFromDropdown &&
      this.dropdown?.open &&
      this.dropdownContent.length
    ) {
      // Enable basic focus trapping
      const options = focusable(this.dropdownContent[0]);

      if (!options.length) return;

      const focused = options.findIndex((opt) => opt.matches(":focus"));

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          options[
            focused === -1 || focused === options.length - 1 ? 0 : focused + 1
          ].focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          options[
            focused === -1 || focused === 0 ? options.length - 1 : focused - 1
          ].focus();
          break;
        }
        default:
          break;
      }
    }
  };

  private toggleChecked() {
    this.checked = !this.checked;

    this.dispatchEvent(
      new CustomEvent<BtrixFilterChipChangeEvent["detail"]>("btrix-change"),
    );
  }
}
