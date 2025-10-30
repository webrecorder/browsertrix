import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { type SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type BillingAddonCheckout } from "@/types/billing";
import appState from "@/utils/state";

const PRESET_MINUTES = [600, 1500, 3000];

type Price = {
  value: number;
  currency: string;
};

@customElement("btrix-org-settings-billing-addon-link")
@localized()
export class OrgSettingsBillingAddonLink extends BtrixElement {
  static _price: Price | undefined;

  @state()
  private lastClickedMinutesPreset: number | undefined = undefined;

  private readonly price = new Task(this, {
    task: async () => {
      if (OrgSettingsBillingAddonLink._price)
        return OrgSettingsBillingAddonLink._price;
      try {
        const price = await this.api.fetch<Price>(
          `/orgs/${this.orgId}/prices/execution-minutes`,
        );
        OrgSettingsBillingAddonLink._price = price;
        return price;
      } catch (error) {
        console.log("Failed to fetch price", error);
        return;
      }
    },
  });

  private readonly checkoutUrl = new Task(this, {
    task: async ([minutes]) => {
      if (!appState.settings?.billingEnabled || !appState.org?.subscription)
        return;

      try {
        const { checkoutUrl } = await this.getCheckoutUrl(minutes);

        if (checkoutUrl) {
          return checkoutUrl;
        } else {
          throw new Error("Missing checkoutUrl");
        }
      } catch (e) {
        console.debug(e);

        throw new Error(
          msg("Sorry, couldn't retrieve current plan at this time."),
        );
      }
    },
    args: () => [undefined] as readonly [number | undefined],
    autoRun: false,
  });
  private async getCheckoutUrl(minutes?: number | undefined) {
    const params = new URLSearchParams();
    if (minutes) params.append("minutes", minutes.toString());
    return this.api.fetch<BillingAddonCheckout>(
      `/orgs/${this.orgId}/checkout/execution-minutes?${params.toString()}`,
    );
  }

  private readonly localizeMinutes = (minutes: number) => {
    return this.localize.number(minutes, {
      style: "unit",
      unit: "minute",
      unitDisplay: "long",
    });
  };

  private async checkout(minutes?: number | undefined) {
    await this.checkoutUrl.run([minutes]);
    if (this.checkoutUrl.value) {
      window.location.href = this.checkoutUrl.value;
    } else {
      this.notify.toast({
        message: msg("Sorry, checkout isn’t available at this time."),
        id: "checkout-unavailable",
        variant: "warning",
      });
    }
  }

  render() {
    const priceForMinutes = (minutes: number) => {
      if (!this.price.value) return;
      return this.localize.number(minutes * this.price.value.value, {
        style: "currency",
        currency: this.price.value.currency,
      });
    };
    const price = priceForMinutes(1);
    return html`
      <sl-button
        @click=${async () => {
          this.lastClickedMinutesPreset = undefined;
          await this.checkout();
        }}
        size="small"
        variant="text"
        ?loading=${this.checkoutUrl.status === TaskStatus.PENDING &&
        this.lastClickedMinutesPreset === undefined}
        ?disabled=${this.checkoutUrl.status === TaskStatus.PENDING &&
        this.lastClickedMinutesPreset !== undefined}
        class="-ml-3"
      >
        ${msg("Add More Execution Minutes")}
      </sl-button>
      <hr class="h-6 border-l" aria-orientation="vertical" />
      <sl-dropdown
        distance="4"
        placement="bottom-end"
        hoist
        stay-open-on-select
        @sl-select=${async (e: SlSelectEvent) => {
          this.lastClickedMinutesPreset = parseInt(e.detail.item.value);
          await this.checkout(this.lastClickedMinutesPreset);
          void e.detail.item.closest("sl-dropdown")!.hide();
        }}
      >
        <sl-button caret slot="trigger" variant="text" size="small" class="">
          <sl-visually-hidden>
            ${msg("Preset minute amounts")}
          </sl-visually-hidden>
        </sl-button>
        <sl-menu>
          <sl-menu-label>${msg("Preset minute amounts")}</sl-menu-label>
          ${PRESET_MINUTES.map((m) => {
            const minutes = this.localizeMinutes(m);
            return html`
              <sl-menu-item
                value=${m}
                ?loading=${this.checkoutUrl.status === TaskStatus.PENDING &&
                this.lastClickedMinutesPreset === m}
                ?disabled=${this.checkoutUrl.status === TaskStatus.PENDING &&
                this.lastClickedMinutesPreset !== m}
              >
                ${minutes}
                ${PRICE_PER_MINUTE &&
                html`<span class="text-xs text-stone-500" slot="suffix">
                  ${priceForMinutes(m)}
                </span>`}
              </sl-menu-item>
            `;
          })}
        </sl-menu>
      </sl-dropdown>
      ${PRICE_PER_MINUTE &&
      html`<div class="ml-auto text-xs text-stone-500">
        ${msg(html`${price} per minute`)}
      </div>`}
    `;
  }
}
