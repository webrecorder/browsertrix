import { localized, msg } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import type {
  CollectionNameInputChangeEvent,
  CollectionNameInputLoadedEvent,
} from "./collection-name-input";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { FormControl } from "@/mixins/FormControl";
import { validationMessageFor } from "@/strings/validation";
import type { Collection } from "@/types/collection";

type SelectDedupeCollectionChangeEventDetail =
  | { id: string }
  | { name: string }
  | null;

export type SelectDedupeCollectionChangeEvent =
  BtrixChangeEvent<SelectDedupeCollectionChangeEventDetail>;

export function isExistingCollection(
  value: SelectDedupeCollectionChangeEventDetail,
): value is { id: string } {
  return Boolean(value && "id" in value);
}

export function isNewCollection(
  value: SelectDedupeCollectionChangeEventDetail,
): value is { name: string } {
  return Boolean(value && "name" in value);
}

@customElement("btrix-select-dedupe-collection")
@localized()
export class SelectDedupeCollection extends FormControl(BtrixElement) {
  @property({ type: String })
  dedupeId?: string;

  @property({ type: Boolean })
  required?: boolean;

  @state()
  private selectedCollection?: Collection;

  @state()
  private newCollectionName?: string;

  public get value() {
    return this.selectedCollection?.name ?? this.newCollectionName;
  }

  public setCustomValidity(message: string) {
    if (message) {
      this.setValidity({ customError: true }, message);
    } else {
      this.setValidity({});
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("selectedCollection") ||
      changedProperties.has("newCollectionName") ||
      changedProperties.has("required")
    ) {
      if (this.required && !this.value) {
        this.setValidity(
          { valueMissing: true },
          validationMessageFor.valueMissing,
        );
      } else {
        this.setValidity({ valueMissing: false });
      }
    }
  }

  render() {
    return html`<btrix-collection-name-input
        size="medium"
        label=${msg("Collection Name")}
        collectionId=${ifDefined(this.dedupeId)}
        ?disableSearch=${!!this.selectedCollection}
        required
        @btrix-loaded=${(e: CollectionNameInputLoadedEvent) => {
          const { value } = e.detail;

          if (value) {
            this.selectedCollection = value;
          }
        }}
        @btrix-change=${(e: CollectionNameInputChangeEvent) => {
          const { value } = e.detail;

          if ("id" in value) {
            this.selectedCollection = value;
            this.newCollectionName = undefined;
          } else {
            this.selectedCollection = undefined;
            this.newCollectionName = value.name;
          }

          void this.dispatchChange();
        }}
        @btrix-clear=${() => {
          this.selectedCollection = undefined;
          this.newCollectionName = undefined;

          void this.dispatchChange();
        }}
      >
      </btrix-collection-name-input>
      ${when(this.newCollectionName, () => {
        const workflow_name = html`<strong class="font-medium"
          >${this.newCollectionName}</strong
        >`;
        return html`
          <div class="form-help-text">
            ${msg(
              html`A new collection named “${workflow_name}” will be created.`,
            )}
          </div>
        `;
      })} `;
  }

  private async dispatchChange() {
    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<SelectDedupeCollectionChangeEvent["detail"]>(
        "btrix-change",
        {
          detail: {
            value: this.selectedCollection
              ? { id: this.selectedCollection.id }
              : this.newCollectionName
                ? { name: this.newCollectionName }
                : null,
          },
        },
      ),
    );
  }
}
