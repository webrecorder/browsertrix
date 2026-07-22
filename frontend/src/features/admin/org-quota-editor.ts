import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { type SlDialog } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { when } from "lit/directives/when.js";
import { type Entries } from "type-fest";

import { LABELS } from "./org-quota-form";
import { defaultPlan, fetchPlans, type Plan } from "./plans";

import { BtrixElement } from "@/classes/BtrixElement";
import { isNotEqual } from "@/utils/is-not-equal";
import { type OrgData, type OrgQuotas } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";

const QUOTA_PRESET_KEYS: (keyof Omit<
  OrgQuotas,
  `${"extra" | "gifted"}ExecMinutes`
>)[] = [
  "maxConcurrentCrawls",
  "maxExecMinutesPerMonth",
  "maxPagesPerCrawl",
  "storageQuota",
];

@customElement("btrix-org-quota-editor")
@localized()
export class OrgQuotaEditor extends BtrixElement {
  @property({ type: Object })
  activeOrg: OrgData | null = null;

  @state({ hasChanged: isNotEqual })
  orgQuotaAdjustments: Partial<OrgQuotas> = {};

  dialog: Ref<SlDialog> = createRef();

  private readonly plansTask = new Task(this, {
    task: async () => {
      const plans = await fetchPlans(this.api);
      // Default to an "unset" plan preset if no plans are available from the backend
      return plans.length === 0 ? [defaultPlan] : plans;
    },
    args: () => [],
  });

  show() {
    void this.dialog.value?.show();
  }

  hide() {
    this.orgQuotaAdjustments = {};
    void this.dialog.value?.hide();
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("activeOrg")) {
      this.orgQuotaAdjustments = {};
    }
  }

  render() {
    const changeCount = Object.values(this.orgQuotaAdjustments).filter(
      (value) => !!value,
    ).length;
    const subtractiveChanges = Object.values(this.orgQuotaAdjustments).filter(
      (value) => value < 0,
    ).length;

    return html`<btrix-dialog
      class="[--width:60rem]"
      ${ref(this.dialog)}
      .label=${msg(str`Quotas for: ${this.activeOrg?.name || ""}`)}
      @sl-after-hide=${() => {
        this.orgQuotaAdjustments = {};
      }}
    >
      ${when(
        this.activeOrg?.quotas,
        (quotas) => html`
          <div class="grid grid-cols-[auto_auto] gap-4">
            <div>
              <btrix-org-quota-form
                .activeOrg=${this.activeOrg}
                .adjustments=${this.orgQuotaAdjustments}
                @btrix-change=${(
                  e: CustomEvent<{ adjustments: Partial<OrgQuotas> }>,
                ) => {
                  this.orgQuotaAdjustments = e.detail.adjustments;
                }}
              >
                <h3
                  class="mb-3 text-lg font-semibold leading-none"
                  slot="label"
                >
                  ${msg("Quotas")}
                </h3>
              </btrix-org-quota-form>
            </div>
            <div>
              <h3 class="mb-3 text-lg font-semibold leading-none">
                ${msg("Presets")}
              </h3>
              <sl-menu class="py-0">
                ${this.plansTask.render({
                  pending: () => msg("Loading plans..."),
                  complete: (plans) =>
                    plans.map((plan) => this.renderPlanPreset(plan, quotas)),
                })}
              </sl-menu>
            </div>
          </div>
        `,
      )}

      <div slot="footer" class="flex justify-end">
        <div class="px-4 py-2 text-xs text-neutral-700">
          ${this.localize.number(changeCount)}
          ${pluralOf("changes", changeCount)}${subtractiveChanges > 0
            ? html`,
                <span class="text-warning-600"
                  >${this.localize.number(subtractiveChanges)}
                  ${msg("subtractive")}</span
                >`
            : null}
        </div>
        <sl-button
          size="small"
          @click="${this.onSubmitQuotas}"
          ?disabled=${changeCount === 0}
          variant="primary"
          >${msg("Update Quotas")}
        </sl-button>
      </div>
    </btrix-dialog>`;
  }

  private renderPlanPreset(plan: Plan, quotas: OrgQuotas) {
    const { id, name, org_quotas } = plan;
    const isCurrentSubscription = id === this.activeOrg?.subscription?.planId;

    const mismatchesCurrentPlan =
      isCurrentSubscription &&
      QUOTA_PRESET_KEYS.some((key) => org_quotas[key] !== quotas[key]);

    return html`<sl-menu-item
      @click=${() => {
        const newQuota: Partial<OrgQuotas> = {};
        QUOTA_PRESET_KEYS.forEach((key) => {
          newQuota[key] = org_quotas[key] - quotas[key];
        });
        this.orgQuotaAdjustments = { ...newQuota };
      }}
    >
      ${name}
      ${isCurrentSubscription
        ? html`<sl-icon name="credit-card" slot="prefix"></sl-icon>`
        : html`<span slot="prefix" class="size-3.5"></span>`}
      ${mismatchesCurrentPlan
        ? html`<sl-icon
            name="exclamation-triangle"
            slot="suffix"
            class="text-warning-600"
          ></sl-icon>`
        : null}
      <sl-menu slot="submenu" class="p-4 text-xs">
        <header class="mb-2 font-medium">
          ${name}${isCurrentSubscription
            ? html` -
                <b class="text-primary-600"
                  >${msg("This is the current subscription.")}</b
                >`
            : null}
        </header>

        <hr class="my-2" />
        <table>
          <tbody>
            ${QUOTA_PRESET_KEYS.map((key) => {
              const value = org_quotas[key];
              const currentValue = this.format(quotas[key], LABELS[key].type, {
                plain: true,
              });
              return html`
                <tr>
                  <td class="pr-2">${LABELS[key].label}</td>
                  <td class="pr-2">
                    ${this.format(value, LABELS[key].type)}
                    ${mismatchesCurrentPlan && value !== quotas[key]
                      ? html`<span class="text-warning-600"
                          >(${msg(html`currently ${currentValue}`)})</span
                        >`
                      : null}
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
        ${mismatchesCurrentPlan
          ? html`<p class="mt-2 font-semibold text-warning-600">
              ${msg("Quotas for this org do not match its current plan.")}
            </p>`
          : null}
      </sl-menu>
    </sl-menu-item>`;
  }

  private format(
    v: number,
    type: "bytes" | "number",
    options: { plain?: boolean; asNumber?: boolean } = {},
  ) {
    const { plain, asNumber } = options;
    const fn = type === "bytes" ? this.localize.bytes : this.localize.number;
    if (plain) {
      if (v <= 0) {
        return asNumber ? fn(0) : msg("Unset");
      }
      return fn(v);
    }
    if (v <= 0)
      return asNumber
        ? html`<span class="text-xs text-neutral-400">${fn(0)}</span>`
        : html`<span class="text-xs text-neutral-600">${msg("Unset")}</span>`;
    return fn(v);
  }

  private onSubmitQuotas() {
    if (this.activeOrg) {
      (
        Object.entries(this.orgQuotaAdjustments) as Entries<
          typeof this.orgQuotaAdjustments
        >
      )
        .filter(Boolean)
        .forEach(([key, value]) => {
          this.activeOrg!.quotas[key] += value ?? 0;
        });
      this.dispatchEvent(
        new CustomEvent("update-quotas", {
          detail: this.activeOrg,
          bubbles: true,
          composed: true,
        }),
      );

      void this.dialog.value?.hide();
    }
  }
}
