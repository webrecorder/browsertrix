import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { SubscriptionStatus } from "@/types/billing";
import type { OrgData } from "@/types/org";

export function computeStats(orgData: OrgData[] = []) {
  // orgs
  const orgs = { all: orgData.length, active: 0 };

  // users
  const allUsersSet = new Set<string>();
  const activeUsersSet = new Set<string>();

  // subscriptions
  const subscriptions = {
    total: 0,
    active: 0,
    trialing: 0,
    trialingCancelled: 0,
    pausedPaymentFailed: 0,
    paymentNeverMade: 0,
    cancelled: 0,
  };

  // storage
  const storage = { total: 0, active: 0 };

  orgData.forEach((org) => {
    Object.keys(org.users ?? {}).forEach((user) => allUsersSet.add(user));
    if (!org.readOnly) {
      orgs.active++;
      Object.keys(org.users ?? {}).forEach((user) => activeUsersSet.add(user));
      storage.active += org.bytesStored;
    }
    if (org.subscription) {
      subscriptions.total++;
      switch (org.subscription.status) {
        case SubscriptionStatus.Active:
          subscriptions.active++;
          break;
        case SubscriptionStatus.Trialing:
          subscriptions.trialing++;
          break;
        case SubscriptionStatus.TrialingCanceled:
          subscriptions.trialingCancelled++;
          break;
        case SubscriptionStatus.PausedPaymentFailed:
          subscriptions.pausedPaymentFailed++;
          break;
        case SubscriptionStatus.PaymentNeverMade:
          subscriptions.paymentNeverMade++;
          break;
        case SubscriptionStatus.Cancelled:
          subscriptions.cancelled++;
          break;
      }
    }

    storage.total += org.bytesStored;
  });

  return {
    orgs,
    users: {
      all: allUsersSet.size,
      active: activeUsersSet.size,
    },
    subscriptions,
    storage,
  };
}

@customElement("btrix-instance-stats")
@localized()
export class Component extends BtrixElement {
  @property({ type: Array })
  orgList: OrgData[] = [];

  render() {
    return guard([this.orgList], () => {
      const { orgs, users, subscriptions, storage } = computeStats(
        this.orgList,
      );

      return html`<ul
        class="mb-4 grid grid-cols-[auto_1fr] items-baseline justify-items-end gap-x-2 p-3 text-xl *:contents md:rounded-lg md:border md:bg-white md:px-8"
      >
        <li>
          <sl-tooltip placement="left">
            <span class="font-bold">${this.localize.number(orgs.active)}</span>
            <span
              slot="content"
              class="grid grid-cols-[1fr_auto] gap-x-1 text-right text-neutral-300"
            >
              ${msg("Total orgs")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(orgs.all)}`}</span
              >
              ${msg("Inactive orgs")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(orgs.all - orgs.active)}`}</span
              >
            </span>
          </sl-tooltip>
          <span class="justify-self-start text-xs text-neutral-600">
            ${msg("Active Orgs")}
            <sl-tooltip content=${msg("Orgs that are not read-only")}
              ><sl-icon class="align-[-2px]" name="info-circle"></sl-icon
            ></sl-tooltip>
          </span>
        </li>
        <li>
          <sl-tooltip placement="left">
            <span class="font-bold">${this.localize.number(users.active)}</span>
            <span
              slot="content"
              class="grid grid-cols-[1fr_auto] gap-x-1 text-right text-neutral-300"
            >
              ${msg("Total users")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(users.all)}`}</span
              >
              ${msg("Inactive users")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(
                  users.all - users.active,
                )}`}</span
              >
            </span>
          </sl-tooltip>
          <span class="justify-self-start text-xs text-neutral-600">
            ${msg("Active Users")}
            <sl-tooltip content=${msg("Users in orgs that are not read-only")}
              ><sl-icon class="align-[-2px]" name="info-circle"></sl-icon
            ></sl-tooltip>
          </span>
        </li>
        <li>
          <sl-tooltip placement="left">
            <span class="font-bold"
              >${this.localize.number(subscriptions.active)}
            </span>
            <span
              slot="content"
              class="grid grid-cols-[1fr_auto] gap-x-1 text-right text-neutral-300"
            >
              ${msg("Active subscriptions")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(subscriptions.active)}`}</span
              >
              ${msg("Trialing subscriptions")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(subscriptions.trialing)}`}</span
              >
              ${msg("Cancelled trialing subscriptions")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(
                  subscriptions.trialingCancelled,
                )}`}</span
              >
              ${msg("Paused (payment failed) subscriptions")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(
                  subscriptions.pausedPaymentFailed,
                )}`}</span
              >
              ${msg("Payment never made")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(
                  subscriptions.paymentNeverMade,
                )}`}</span
              >
              ${msg("Cancelled subscriptions")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(subscriptions.cancelled)}`}</span
              >
              <hr class="col-span-2 -mx-2 my-1 border-neutral-500" />
              ${msg("Total subscriptions (all states)")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.number(subscriptions.total)}`}</span
              >
            </span>
          </sl-tooltip>
          <span class="justify-self-start text-xs text-neutral-600">
            ${msg("Active Subscriptions")}
            <sl-tooltip
              content=${msg(
                "Orgs with active subscriptions (including with future cancellation dates)",
              )}
              ><sl-icon class="align-[-2px]" name="info-circle"></sl-icon
            ></sl-tooltip>
          </span>
        </li>
        <li>
          <sl-tooltip placement="left">
            <span class="text-xl font-bold"
              >${this.localize.bytes(storage.total)}
            </span>
            <span
              slot="content"
              class="grid grid-cols-[1fr_auto] gap-x-1 text-right text-neutral-300"
            >
              ${msg("Storage in active orgs")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.bytes(storage.active)}`}</span
              >
              ${msg("Storage in inactive orgs")}:
              <span class="text-left font-bold text-white"
                >${html`${this.localize.bytes(
                  storage.total - storage.active,
                )}`}</span
              >
            </span>
          </sl-tooltip>
          <span class="justify-self-start text-xs text-neutral-600">
            ${msg("Data Stored")}
            <sl-tooltip content=${msg("Across all orgs")}
              ><sl-icon class="align-[-2px]" name="info-circle"></sl-icon
            ></sl-tooltip>
          </span>
        </li>
      </ul>`;
    });
  }
}
