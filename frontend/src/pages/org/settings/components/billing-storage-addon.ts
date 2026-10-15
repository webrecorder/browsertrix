import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import {
  type SlInputEvent,
  type SlSelectEvent,
} from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import PollTask from "@/controllers/poll";
import {
  formatStorageAddonSize,
  STORAGE_ADDON_GB,
} from "@/pages/org/settings/components/billing";
import { APIErrorDetail } from "@/types/api";
import type { AddonStoragePricing } from "@/types/billing";
import type { OrgData } from "@/types/org";
import { isApiError } from "@/utils/api";
import { AppStateService } from "@/utils/state";

const PRESET_GB = [100, 500, 1000];

const CUSTOM_MIN_GB = 1;
const CUSTOM_MAX_GB = 5000;

/** How often to re-check whether the org's quota has caught up */
const CONVERGENCE_POLL_SECONDS = 5;

@customElement("btrix-org-settings-billing-storage-addon")
@localized()
export class OrgSettingsBillingStorageAddon extends BtrixElement {
  @state()
  private showCustom = false;

  @state()
  private customSizeGB = "";

  @state()
  private lastRequestedGB: number | undefined = undefined;

  /** Add-on size (GB) the user has picked but not yet confirmed, if any */
  @state()
  private confirmGB: number | undefined = undefined;

  private readonly priceTask = new Task(this, {
    task: async () => {
      if (!this.env.billingEnabled) return;
      return this.fetchPrice();
    },
    args: () => [] as const,
  });

  private readonly updateTask = new Task(this, {
    task: async ([sizeGB]) => {
      if (!this.env.billingEnabled || sizeGB === undefined) return;
      try {
        await this.api.fetch<Record<string, number | null>>(
          `/orgs/${this.orgId}/subscription/storage-addon`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sizeGB }),
          },
        );

        // The org's quota only updates once the external subscription app's
        // webhook arrives, so poll the org until it catches up. `start()` (not
        // `resume()`): the first update has no previous poll value, and
        // `resume()` does nothing then.
        await this.catchUpPoll.start();
      } catch (e) {
        if (
          isApiError(e) &&
          e.errorCode === APIErrorDetail.StorageAddonBelowUsage
        ) {
          this.notify.toast({
            message: msg(
              str`You don’t have enough space available. Free up storage before reducing your storage add-on. Current usage: ${this.usageText} (${this.targetText(sizeGB)} target).`,
            ),
            variant: "danger",
          });
        } else if (
          isApiError(e) &&
          e.errorCode === APIErrorDetail.StorageAddonScheduledChangePending
        ) {
          this.notify.toast({
            message: msg(
              "A plan change is already scheduled on your subscription. Resolve or undo it before changing your storage add-on.",
            ),
            variant: "danger",
          });
        } else {
          this.notify.toast({
            message: msg("Sorry, couldn’t update your storage add-on."),
            variant: "danger",
          });
        }
        throw e;
      }
    },
    args: () => [undefined] as readonly [number | undefined],
    autoRun: false,
  });

  /**
   * Re-fetch the org until the add-on change shows up in it, then stop.
   * An external subscription app webhook updates the quota, so what we show
   * stays out of date until it arrives.
   */
  private readonly catchUpPoll = new PollTask(this, {
    task: async (_, { signal }) => {
      const org = await this.api.fetch<OrgData>(`/orgs/${this.orgId}`, {
        signal,
      });

      if (this.hasConverged(org)) {
        this.catchUpPoll.pause();
      }

      AppStateService.updateOrg(org);

      return org;
    },
    args: () => [] as const,
    timeoutSeconds: CONVERGENCE_POLL_SECONDS,
    autoRun: false,
  });

  private get addonSizeGB(): number {
    return Math.floor(
      (this.org?.quotas.extraStorageQuota ?? 0) / STORAGE_ADDON_GB,
    );
  }

  private get pendingGB(): number | null {
    return this.org?.subscription?.storageAddonPendingGB ?? null;
  }

  private get usageText(): string {
    return this.localize.bytes(this.org?.bytesStored ?? 0);
  }

  private targetText(sizeGB: number): string {
    const target =
      (this.org?.quotas.storageQuota ?? 0) + sizeGB * STORAGE_ADDON_GB;
    return this.localize.bytes(target);
  }

  /** Has the org caught up with the change we last asked for? */
  private hasConverged(org: OrgData): boolean {
    const requestedGB = this.lastRequestedGB;
    if (requestedGB === undefined) return true;

    const sizeGB = Math.floor(org.quotas.extraStorageQuota / STORAGE_ADDON_GB);
    const pendingGB = org.subscription?.storageAddonPendingGB ?? null;

    if (requestedGB > sizeGB) {
      // Increase: the quota itself goes up once Stripe has been told, and
      // there is no "pending" value for an increase.
      return sizeGB >= requestedGB;
    }

    if (requestedGB !== sizeGB) {
      // Reduction or cancellation: the *pending* value is what changes; the
      // quota itself stays the same until the end of the billing period, so
      // checking `sizeGB` alone would never look finished.
      return pendingGB === requestedGB;
    }

    // keep (undo a pending change): the pending state clears
    return pendingGB === null;
  }

  private async fetchPrice(): Promise<AddonStoragePricing> {
    return this.api.fetch<AddonStoragePricing>(
      `/orgs/${this.orgId}/price/storage`,
    );
  }

  private async updateAddon(sizeGB: number) {
    // remembered so the poll knows what it is waiting for
    this.lastRequestedGB = sizeGB;
    await this.updateTask.run([sizeGB]);
  }

  private onCustomSubmit() {
    const sizeGB = Number(this.customSizeGB);
    if (
      !Number.isInteger(sizeGB) ||
      sizeGB < CUSTOM_MIN_GB ||
      sizeGB > CUSTOM_MAX_GB
    ) {
      this.notify.toast({
        message: msg(
          str`Enter a storage amount between ${CUSTOM_MIN_GB} and ${CUSTOM_MAX_GB} GB.`,
        ),
        variant: "danger",
      });
      return;
    }
    this.requestChange(sizeGB);
  }

  /**
   * Ask before changing the add-on: a change is charged to the customer's
   * subscription, so it must never happen on a single click.
   *
   * Picking the size the organization already has is either a no-op or the
   * "keep" that undoes a pending change. Neither changes what is charged, so
   * those still apply straight away.
   */
  private requestChange(sizeGB: number) {
    if (sizeGB === this.addonSizeGB) {
      if (this.pendingGB !== null) void this.updateAddon(sizeGB);
      return;
    }
    this.confirmGB = sizeGB;
  }

  private readonly hideConfirm = () => {
    this.confirmGB = undefined;
  };

  private readonly confirmChange = async () => {
    const sizeGB = this.confirmGB;
    if (sizeGB === undefined) return;
    this.confirmGB = undefined;
    await this.updateAddon(sizeGB);
  };

  private priceForGB(gb: number): string | undefined {
    const pricing = this.priceTask.value;
    if (!pricing) return undefined;
    return this.localize.number(gb * pricing.value, {
      style: "currency",
      currency: pricing.currency,
    });
  }

  render() {
    const isPending =
      this.updateTask.status === TaskStatus.PENDING &&
      this.lastRequestedGB !== undefined;

    const price = this.priceForGB(1);

    const hasAddon = this.addonSizeGB > 0;

    return html`
      <div class="flex flex-wrap items-center gap-2">
        <sl-dropdown
          distance="4"
          placement="bottom-start"
          hoist
          @sl-select=${(e: SlSelectEvent) => {
            const value = e.detail.item.value;
            this.showCustom = value === "custom";
            if (value === "custom") return;
            this.requestChange(value === "cancel" ? 0 : parseInt(value));
          }}
        >
          <sl-button
            caret
            slot="trigger"
            variant="text"
            size="small"
            class="-ml-3"
            ?loading=${isPending && !this.showCustom}
            ?disabled=${isPending}
          >
            ${hasAddon ? msg("Modify storage add-on") : msg("Add more storage")}
          </sl-button>
          <sl-menu>
            <sl-menu-label>
              ${msg("Add or change storage")}
              <div class="text-xs font-normal">
                ${msg("Charged to your current plan’s renewal.")}
              </div>
            </sl-menu-label>
            ${PRESET_GB.map(
              (gb) => html`
                <sl-menu-item value=${gb} ?disabled=${isPending}>
                  ${formatStorageAddonSize(this.localize, gb)}
                  ${this.priceTask.value &&
                  html`<span class="text-xs text-stone-500" slot="suffix">
                    ${this.priceForGB(gb)}
                  </span>`}
                </sl-menu-item>
              `,
            )}
            <sl-menu-item
              value="custom"
              ?disabled=${isPending}
              @click=${() => {
                this.showCustom = true;
              }}
            >
              ${msg("Custom…")}
            </sl-menu-item>
            ${when(
              this.addonSizeGB > 0 && this.pendingGB !== 0,
              () => html`
                <sl-divider></sl-divider>
                <sl-menu-item value="cancel" ?disabled=${isPending}>
                  ${msg("Cancel add-on")}
                  <div class="text-xs font-normal">
                    ${msg("Stops at your next renewal")}
                  </div>
                </sl-menu-item>
              `,
            )}
          </sl-menu>
        </sl-dropdown>
        ${when(
          this.org?.subscription,
          () => html`
            <span class="text-neutral-500">
              ${hasAddon
                ? formatStorageAddonSize(this.localize, this.addonSizeGB)
                : msg("None")}
              ${this.renderPendingState()}
            </span>
          `,
          () => html`
            <sl-skeleton class="inline-block h-4 w-16"></sl-skeleton>
          `,
        )}
        ${this.renderCancellationActions()}
        ${price &&
        html`<div class="ml-auto text-xs text-stone-500">
          ${this.renderUnitPrice(price)}
        </div>`}
      </div>
      ${when(
        this.showCustom,
        () => html`
          <div class="mt-2 flex items-center gap-2">
            <sl-input
              type="number"
              min=${CUSTOM_MIN_GB}
              max=${CUSTOM_MAX_GB}
              value=${this.customSizeGB}
              @sl-input=${(e: SlInputEvent) => {
                this.customSizeGB = (e.target as HTMLInputElement).value;
              }}
              placeholder=${msg("GB")}
              size="small"
              class="w-40"
            >
              <span slot="suffix">${msg("GB")}</span>
            </sl-input>
            <sl-button
              size="small"
              variant="primary"
              ?loading=${isPending}
              ?disabled=${isPending || !this.customSizeGB}
              @click=${this.onCustomSubmit}
            >
              ${msg("Apply")}
            </sl-button>
            <sl-button
              size="small"
              variant="text"
              ?disabled=${isPending}
              @click=${() => {
                this.showCustom = false;
                this.customSizeGB = "";
              }}
            >
              ${msg("Cancel")}
            </sl-button>
          </div>
        `,
      )}
      ${this.renderConfirmDialog()}
    `;
  }

  /**
   * Confirmation for a change to the add-on. The amount is charged to the
   * customer's subscription, so the impact on their bill and the timing are
   * spelled out before anything is sent to Stripe.
   */
  private renderConfirmDialog() {
    const targetGB = this.confirmGB;
    if (targetGB === undefined) return nothing;

    const currentGB = this.addonSizeGB;
    const planStorage = this.org?.quotas.storageQuota ?? 0;
    const isGrowth = targetGB > currentGB;
    const isCancel = targetGB === 0;

    const renewalDate = this.org?.subscription?.renewalDate
      ? this.localize.date(this.org.subscription.renewalDate, {
          dateStyle: "medium",
        })
      : "";
    const current = this.localize.bytes(
      planStorage + currentGB * STORAGE_ADDON_GB,
    );
    const targetTotal = this.localize.bytes(
      planStorage + targetGB * STORAGE_ADDON_GB,
    );
    const targetSize = formatStorageAddonSize(this.localize, targetGB);
    const cost = this.priceForGB(targetGB);

    const title = isGrowth
      ? msg("Increase storage add-on?")
      : isCancel
        ? msg("Cancel storage add-on?")
        : msg("Reduce storage add-on?");

    return html`<btrix-dialog
      label=${title}
      ?open=${true}
      @sl-hide=${this.hideConfirm}
    >
      ${when(
        isGrowth,
        () => html`
          <p>
            ${msg(
              str`Your organization's storage will increase to ${targetTotal} right away.`,
            )}
          </p>
          <p class="mt-3">
            ${cost
              ? msg(
                  str`You'll be charged a prorated amount now for the rest of this billing period, and ${cost} at each renewal.`,
                )
              : msg(
                  "You'll be charged a prorated amount now for the rest of this billing period.",
                )}
          </p>
        `,
        () => html`
          <p>
            ${isCancel
              ? msg(
                  str`At your next renewal on ${renewalDate}, the add-on will be cancelled and your organization's storage will drop to your plan's ${this.localize.bytes(planStorage)}.`,
                )
              : msg(
                  str`At your next renewal on ${renewalDate}, the add-on will drop to ${targetSize}, giving your organization ${targetTotal} of storage.`,
                )}
          </p>
          ${when(
            cost && targetGB > 0,
            (cost) => html`
              <p class="mt-3">
                ${msg(
                  str`You'll be charged ${cost} at each renewal from then on.`,
                )}
              </p>
            `,
          )}
          <p class="mt-3">
            ${msg(
              str`Until then, your organization keeps ${current} of storage and you keep paying for it.`,
            )}
          </p>
        `,
      )}
      <div slot="footer" class="flex justify-between">
        <sl-button size="small" @click=${this.hideConfirm} .autofocus=${true}>
          ${msg("Cancel")}
        </sl-button>
        <sl-button
          size="small"
          variant=${isGrowth ? "primary" : "danger"}
          @click=${this.confirmChange}
        >
          ${isGrowth
            ? msg("Increase add-on")
            : isCancel
              ? msg("Cancel add-on")
              : msg("Reduce add-on")}
        </sl-button>
      </div>
    </btrix-dialog>`;
  }

  /** "$x per GB per <cycle>"; falls back to "per renewal" when the external
      subscription app doesn't send the billing interval. */
  private renderUnitPrice(price: string) {
    const interval = this.org?.subscription?.billingInterval;
    const count = this.org?.subscription?.billingIntervalCount ?? 1;

    if (interval === "month") {
      return count === 1
        ? msg(html`${price} per GB per month`)
        : msg(
            html`${price} per GB every ${this.localize.number(count)} months`,
          );
    }
    if (interval === "year") {
      return count === 1
        ? msg(html`${price} per GB per year`)
        : msg(html`${price} per GB every ${this.localize.number(count)} years`);
    }
    return msg(html`${price} per GB, per renewal`);
  }

  private renderPendingState() {
    const pendingGB = this.pendingGB;
    if (pendingGB === null) return nothing;

    const rawRenewalDate = this.org?.subscription?.renewalDate;
    const renewalDate = rawRenewalDate
      ? this.localize.date(rawRenewalDate, { dateStyle: "medium" })
      : null;

    let text: string;
    if (pendingGB === 0) {
      text = renewalDate
        ? msg(str`cancels at ${renewalDate}`)
        : msg("cancels at your next renewal");
    } else {
      const size = formatStorageAddonSize(this.localize, pendingGB);
      text = renewalDate
        ? msg(str`reduces to ${size} at ${renewalDate}`)
        : msg(str`reduces to ${size} at your next renewal`);
    }

    return html`<span class="text-stone-500"> &mdash; ${text} </span>`;
  }

  private renderCancellationActions() {
    if (this.pendingGB === null) return nothing;

    const isPending =
      this.updateTask.status === TaskStatus.PENDING &&
      this.lastRequestedGB !== undefined;

    return html`
      <sl-button
        size="small"
        variant="text"
        ?loading=${isPending && this.lastRequestedGB === this.addonSizeGB}
        ?disabled=${isPending}
        @click=${() => {
          // keep add-on: post current active quantity to clear the pending change
          void this.updateAddon(this.addonSizeGB);
        }}
      >
        ${msg(
          str`Keep ${formatStorageAddonSize(this.localize, this.addonSizeGB)}`,
        )}
      </sl-button>
    `;
  }
}
