import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { type SlDialog, type SlSwitch } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  featureFlagsMetadataSchema,
  type FeatureFlagMetadata,
} from "@/types/featureFlags";
import { type OrgData } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";

@customElement("btrix-org-feature-flags")
@localized()
export class OrgFeatureFlags extends BtrixElement {
  @property({ type: Object })
  activeOrg?: OrgData | null = null;

  dialog: Ref<SlDialog> = createRef();

  show() {
    void this.flags.run();
    void this.dialog.value?.show();
  }

  hide() {
    void this.dialog.value?.hide();
  }

  flags = new Task(this, {
    task: async () => {
      return featureFlagsMetadataSchema.parse(
        await this.api.fetch<FeatureFlagMetadata[]>("/flags/metadata"),
      );
    },
    autoRun: false,
  });

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("activeOrg")) {
      void this.flags.run();
    }
  }

  render() {
    return html` <btrix-dialog
      ${ref(this.dialog)}
      .label="${msg("Feature flags for")}: ${this.activeOrg?.name || ""}"
    >
      ${this.flags.value?.length
        ? this.flags.value.map((flag) => {
            const organization_plural = pluralOf("organizations", flag.count);
            const organization_count = flag.count;
            return html`<sl-switch
              class="part-base w-full part-[label]:me-2 part-[label]:ms-0 part-[base]:flex part-[base]:flex-row-reverse part-[base]:justify-between part-[label]:font-mono part-[label]:text-base"
              .checked=${!!this.activeOrg?.featureFlags[flag.name]}
              @sl-change=${async (e: Event) => {
                void this.setFlag(flag.name, (e.target as SlSwitch).checked);
              }}
            >
              ${flag.name}
              <span slot="help-text"
                >${flag.description}
                <br />
                ${msg(
                  html`Enabled for ${organization_count} ${organization_plural}.`,
                )}
              </span>
            </sl-switch>`;
          })
        : html`<div class="my-4 text-center">
            ${msg("No feature flags available")}
          </div>`}
    </btrix-dialog>`;
  }

  async setFlag(name: string, value: boolean) {
    try {
      await this.api.fetch(`/flags/${name}/org/${this.activeOrg!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      });
    } catch (e) {
      console.error("Failed to update feature flag", { name, value, error: e });
      this.notify.toast({
        message: msg(str`Failed to update feature flag ${name}`),
        variant: "danger",
        id: "flag-update-error",
      });
    }
    this.dispatchEvent(
      new CustomEvent("btrix-update-feature-flags", {
        detail: this.activeOrg,
        bubbles: true,
        composed: true,
      }),
    );
  }
}
