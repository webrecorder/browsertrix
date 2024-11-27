import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlIcon, SlSelect } from "@shoelace-style/shoelace";
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
      icon: "eye-slash-fill",
      detail: msg("Only org members can view"),
    },
    [CollectionAccess.Unlisted]: {
      label: msg("Unlisted"),
      // icon: "link-45deg",
      icon: "people-fill",
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
      <sl-select
        label=${msg("Visibility")}
        value=${this.value}
        hoist
        @sl-hide=${this.stopProp}
        @sl-change=${(e: SlChangeEvent) => {
          const { value } = e.currentTarget as SlSelect;
          this.value = value as CollectionAccess;
        }}
      >
        <sl-icon slot="prefix" name=${selected.icon}></sl-icon>
        <span slot="suffix" class="whitespace-nowrap">${selected.detail}</span>
        ${Object.entries(SelectCollectionAccess.Options).map(
          ([value, { label, icon, detail }]) => html`
            <sl-option value=${value}>
              <sl-icon slot="prefix" name=${icon}></sl-icon>
              ${label}
              <span slot="suffix">${detail}</span>
            </sl-option>
          `,
        )}
      </sl-select>
    `;
  }

  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
