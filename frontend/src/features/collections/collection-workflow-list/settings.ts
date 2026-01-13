import { localized, msg } from "@lit/localize";
import type { SlSwitch } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { isNotEqual } from "@/utils/is-not-equal";
import { tw } from "@/utils/tailwind";

export type CollectionWorkflowListSettingChangeEvent = BtrixChangeEvent<{
  autoAdd: boolean;
  dedupe?: boolean | null;
}>;

/**
 * Additional settings for each workflow in `<btrix-collection-workflow-list>`
 */
@customElement("btrix-collection-workflow-list-settings")
@localized()
export class CollectionWorkflowListSettings extends BtrixElement {
  @property({ type: String })
  workflowId = "";

  @property({ type: String })
  collectionId = "";

  @property({ type: String })
  dedupeCollId = "";

  @property({ type: Array, hasChanged: isNotEqual })
  autoAddCollections: string[] = [];

  @state()
  private autoAdd = false;

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("collectionId") ||
      changedProperties.has("autoAddCollections")
    ) {
      console.log(this.collectionId, this.autoAddCollections);
      this.autoAdd = this.autoAddCollections.some(
        (id) => id === this.collectionId,
      );
    }
  }

  render() {
    const disableDedupe =
      !this.autoAdd ||
      Boolean(this.dedupeCollId && this.dedupeCollId !== this.collectionId);

    return html`
      <div
        class="flex h-11 w-max items-center gap-4 whitespace-nowrap rounded border px-4"
      >
        <div class="flex grow basis-0 justify-center transition-all">
          <sl-switch
            class="mx-[2px] inline-block"
            size="small"
            ?checked=${this.autoAdd}
            ?disabled=${!this.workflowId}
            @sl-change=${(e: CustomEvent) => {
              e.stopPropagation();

              this.autoAdd = (e.target as SlSwitch).checked;

              this.dispatchEvent(
                new CustomEvent<
                  CollectionWorkflowListSettingChangeEvent["detail"]
                >("btrix-change", {
                  detail: {
                    value: {
                      autoAdd: this.autoAdd,
                    },
                  },
                }),
              );
            }}
          >
            <span class="text-neutral-500">${msg("Auto-Add")}</span>
          </sl-switch>
        </div>
        <div
          class=${clsx(
            tw`basis-0 overflow-hidden transition-all`,
            this.autoAdd ? tw`grow` : tw`shrink`,
          )}
        >
          <btrix-popover
            content=${this.autoAdd
              ? msg(
                  "This workflow is already deduplicated in another collection.",
                )
              : msg("Enable auto-add to enable deduplication;.")}
            ?disabled=${!disableDedupe}
          >
            <sl-switch
              class="mx-[2px] inline-block"
              size="small"
              ?checked=${Boolean(
                this.dedupeCollId && this.dedupeCollId === this.collectionId,
              )}
              ?disabled=${!this.workflowId || disableDedupe}
              @click=${(e: MouseEvent) => {
                e.stopPropagation();
              }}
              @sl-change=${(e: CustomEvent) => {
                e.stopPropagation();
                this.dispatchEvent(
                  new CustomEvent<
                    CollectionWorkflowListSettingChangeEvent["detail"]
                  >("btrix-change", {
                    detail: {
                      value: {
                        autoAdd: this.autoAdd,
                        dedupe: (e.target as SlSwitch).checked,
                      },
                    },
                  }),
                );
              }}
            >
              <span class="text-neutral-500">${msg("Dedupe")}</span>
            </sl-switch>
          </btrix-popover>
        </div>
      </div>
    `;
  }
}
