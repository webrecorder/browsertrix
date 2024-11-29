import { localized, msg } from "@lit/localize";
import type { SlIcon, SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { CollectionAccess } from "@/types/collection";

@localized()
@customElement("btrix-select-collection-access")
export class SelectCollectionAccess extends BtrixElement {
  static readonly Options: Record<
    CollectionAccess,
    { label: string; icon: NonNullable<SlIcon["name"]>; detail: string }
  > = {
    [CollectionAccess.Private]: {
      label: msg("Private"),
      icon: "lock",
      detail: msg("Only org members can view"),
    },
    [CollectionAccess.Unlisted]: {
      label: msg("Unlisted"),
      icon: "link-45deg",
      detail: msg("Only people with the link can view"),
    },

    [CollectionAccess.Public]: {
      label: msg("Public"),
      icon: "globe2",
      detail: msg("Anyone can view on the org's public profile"),
    },
  };

  @property({ type: String })
  value: CollectionAccess = CollectionAccess.Private;

  @property({ type: Boolean })
  readOnly = false;

  render() {
    const selected = SelectCollectionAccess.Options[this.value];

    if (this.readOnly) {
      return html`
        <sl-input label=${msg("Visibility")} readonly value=${selected.label}>
          <sl-icon slot="prefix" name=${selected.icon}></sl-icon>
          <span slot="suffix">${selected.detail}</span>
        </sl-input>
      `;
    }

    return html`
      <div>
        <div class="form-label" id="collectionAccessLabel">
          ${msg("Visibility")}
        </div>
        <sl-dropdown
          class="block w-full"
          aria-labelledby="collectionAccessLabel"
          hoist
          sync="width"
          @sl-select=${(e: SlSelectEvent) => {
            const { value } = e.detail.item;
            this.value = value as CollectionAccess;
          }}
        >
          <sl-button slot="trigger" size="large" class="button-card" caret>
            <sl-icon
              slot="prefix"
              name=${selected.icon}
              class="size-6"
            ></sl-icon>
            <span>${selected.label}</span>
            <div class="font-normal text-neutral-500">${selected.detail}</div>
          </sl-button>
          <sl-menu>
            ${Object.entries(SelectCollectionAccess.Options).map(
              ([value, { label, icon, detail }]) => html`
                <sl-menu-item
                  value=${value}
                  type="checkbox"
                  ?checked=${label === selected.label}
                >
                  <sl-icon slot="prefix" name=${icon}></sl-icon>
                  ${label}
                  <span slot="suffix">${detail}</span>
                </sl-menu-item>
              `,
            )}
          </sl-menu>
        </sl-dropdown>
      </div>
    `;
  }
}
