import { localized, msg, str } from "@lit/localize";
import { type SlDialog } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import { isEqual } from "lodash";
import { type Entries } from "type-fest";
import z from "zod";

import { BtrixElement } from "@/classes/BtrixElement";
import { type RowEditEventDetail } from "@/components/ui/data-grid/data-grid-row";
import {
  GridColumnType,
  type GridColumn,
} from "@/components/ui/data-grid/types";
import { orgQuotasSchema, type OrgData, type OrgQuotas } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";

const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  org_quotas: orgQuotasSchema,
  testmode: z.boolean(),
});

const PlansResponseSchema = z.object({
  plans: z.array(PlanSchema),
});

type PlansResponse = z.infer<typeof PlansResponseSchema>;

const LABELS = {
  maxConcurrentCrawls: {
    label: msg("Max Concurrent Crawls"),
    type: "number",
  },
  maxPagesPerCrawl: {
    label: msg("Max Pages Per Crawl"),
    type: "number",
  },
  storageQuota: {
    label: msg("Storage Quota"),
    type: "bytes",
    scale: 1e9,
  },
  maxExecMinutesPerMonth: {
    label: msg("Max Execution Minutes Per Month"),
    type: "number",
  },
  extraExecMinutes: {
    label: msg("Extra Execution Minutes"),
    type: "number",
  },
  giftedExecMinutes: {
    label: msg("Gifted Execution Minutes"),
    type: "number",
  },
} as const satisfies {
  [key in keyof OrgQuotas]: {
    label: string;
    type: "number" | "bytes";
    scale?: number;
  };
};

@customElement("btrix-org-quota-editor")
@localized()
export class OrgQuotaEditor extends BtrixElement {
  @property({ type: Object })
  activeOrg: OrgData | null = null;

  @state({ hasChanged: (a, b) => !isEqual(a, b) })
  orgQuotaAdjustments: Partial<OrgQuotas> = {};

  dialog: Ref<SlDialog> = createRef();

  @state()
  plans = this.api.fetch<PlansResponse>("/orgs/plans");

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
    return html` <btrix-dialog
      ${ref(this.dialog)}
      .label=${msg(str`Quotas for: ${this.activeOrg?.name || ""}`)}
      @sl-after-hide=${() => {
        // TODO move to parent;
        this.orgQuotaAdjustments = {};
      }}
    >
      ${when(this.activeOrg?.quotas, (quotas) => {
        const entries = Object.entries(quotas) as Entries<typeof quotas>;
        const items = entries.map(([key, value]) => {
          const labelConfig = LABELS[key];
          let currentAdjustment = this.orgQuotaAdjustments[key] || 0;
          if (labelConfig.type === "bytes") {
            currentAdjustment = Math.floor(
              currentAdjustment / labelConfig.scale,
            );
          }
          return {
            key: key,
            current: value,
            adjustment: currentAdjustment,
          };
        });
        type Item = (typeof items)[number];
        const columns: GridColumn<Item>[] = [
          {
            label: msg("Quota"),
            field: "key",
            editable: false,
            width: "2fr",
            renderCell: ({ item }) => html`${LABELS[item.key].label}`,
            align: "start",
          },
          {
            label: msg("Value"),
            field: "current",
            editable: false,
            width: "1fr",
            renderCell: ({ item }) => {
              const key = item.key;
              const value = item.current;
              const labelConfig = LABELS[key];
              const format = (v: number, isInitialValue = true) =>
                this.format(v, labelConfig.type, isInitialValue);

              return this.orgQuotaAdjustments[key]
                ? Math.sign(this.orgQuotaAdjustments[key]) === 1
                  ? html`<span class="tabular-nums">
                      <b>${format(value + this.orgQuotaAdjustments[key])}</b>
                      <span class="inline-block">
                        (${format(value, false)}
                        <span class="whitespace-nowrap text-green-600">
                          +&nbsp;${format(this.orgQuotaAdjustments[key])}</span
                        >)</span
                      ></span
                    >`
                  : html`<span class="tabular-nums">
                      <b>${format(value + this.orgQuotaAdjustments[key])}</b>
                      <span class="inline-block">
                        (${format(value, false)}
                        <span class="whitespace-nowrap text-red-600">
                          -&nbsp;${format(-this.orgQuotaAdjustments[key])}</span
                        >)</span
                      ></span
                    >`
                : format(value);
            },
          },
          {
            label: msg("Adjustment"),
            field: "adjustment",
            editable: true,
            width: "1fr",
            inputType: GridColumnType.Number,
            min: (item) => -1 * (item?.current ?? 0),
            step: 1,
          },
        ];

        return html`
          <label
            class="font-sm font-medium text-neutral-500"
            for="org-quota-presets"
            >${msg("Presets")}</label
          >
          <btrix-overflow-scroll class="-mx-4 part-[content]:px-4">
            <sl-button-group id="org-quota-presets">
              ${until(
                this.plans.then(({ plans }) =>
                  plans.map(({ id, name, org_quotas }) => {
                    const isCurrentSubscription =
                      id === this.activeOrg?.subscription?.planId;
                    const presets: Omit<
                      OrgQuotas,
                      `${"extra" | "gifted"}ExecMinutes`
                    > = {
                      maxConcurrentCrawls: org_quotas.maxConcurrentCrawls,
                      maxExecMinutesPerMonth: org_quotas.maxExecMinutesPerMonth,
                      maxPagesPerCrawl: org_quotas.maxPagesPerCrawl,
                      storageQuota: org_quotas.storageQuota,
                    };
                    return html`<btrix-popover placement="top">
                      <sl-button
                        @click=${() => {
                          const newQuota: Partial<OrgQuotas> = {};

                          (
                            Object.entries(presets) as Entries<typeof presets>
                          ).forEach(([k, v]) => {
                            newQuota[k] = v - quotas[k];
                          });
                          this.orgQuotaAdjustments = { ...newQuota };
                        }}
                      >
                        ${name}
                        ${isCurrentSubscription
                          ? html`<sl-icon
                              name="credit-card"
                              slot="prefix"
                            ></sl-icon>`
                          : null}
                      </sl-button>
                      <div slot="content">
                        <header class="mb-2 font-medium">
                          ${name}${isCurrentSubscription
                            ? html` -
                                <b class="text-primary-600"
                                  >${msg(
                                    "This is the current subscription.",
                                  )}</b
                                >`
                            : null}
                        </header>

                        <hr class="my-2" />
                        <table>
                          <tbody>
                            ${(
                              Object.entries(presets) as Entries<typeof presets>
                            ).map(
                              ([key, value]) => html`
                                <tr>
                                  <td class="pr-2">${LABELS[key].label}</td>
                                  <td class="pr-2">
                                    ${this.format(value, LABELS[key].type)}
                                  </td>
                                </tr>
                              `,
                            )}
                          </tbody>
                        </table>
                      </div>
                    </btrix-popover>`;
                  }),
                ),
                msg("Loading plans..."),
              )}
            </sl-button-group>
          </btrix-overflow-scroll>
          <btrix-data-grid
            editCells
            .columns=${columns}
            rowKey="key"
            .items=${items}
            @btrix-input=${(event: CustomEvent<RowEditEventDetail<Item>>) => {
              const key = event.detail.rowKey as keyof OrgQuotas;
              let value = Number(event.detail.value);
              const labelConfig = LABELS[key];
              if (labelConfig.type === "bytes") {
                value = Math.floor(value * labelConfig.scale);
              }
              this.orgQuotaAdjustments = {
                ...this.orgQuotaAdjustments,
                [key]: value,
              };
            }}
          ></btrix-data-grid>
        `;
      })}

      <div slot="footer" class="flex justify-end">
        <div class="px-4 py-2 text-xs text-neutral-700">
          ${this.localize.number(changeCount)}
          ${pluralOf("changes", changeCount)}
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

  private format(v: number, type: "bytes" | "number", isInitialValue = true) {
    if (v <= 0)
      return isInitialValue
        ? html`<span class="text-xs text-neutral-600">${msg("Unset")}</span>`
        : html`<span class="text-xs text-neutral-400">${msg("0")}</span>`;
    const fn = type === "bytes" ? this.localize.bytes : this.localize.number;
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
