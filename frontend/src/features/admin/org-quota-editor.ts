import { localized, msg, str } from "@lit/localize";
import { type SlDialog, type SlInput } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { when } from "lit/directives/when.js";
import { isEqual } from "lodash";
import { type Entries } from "type-fest";

import { BtrixElement } from "@/classes/BtrixElement";
import { type RowEditEventDetail } from "@/components/ui/data-grid/data-grid-row";
import {
  GridColumnType,
  type GridColumn,
} from "@/components/ui/data-grid/types";
import { type OrgData, type OrgQuotas } from "@/utils/orgs";

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
            label: msg("Key"),
            field: "key",
            editable: false,
            width: "2fr",
            renderCell: ({ item }) => html`${LABELS[item.key].label}`,
          },
          {
            label: msg("Current Value"),
            field: "current",
            editable: false,
            width: "1fr",
            renderCell: ({ item }) => {
              const key = item.key;
              const value = item.current;
              const labelConfig = LABELS[key];
              const format = (v: number, isInitialValue = true) => {
                if (v <= 0)
                  return isInitialValue
                    ? html`<span class="text-sm text-neutral-400"
                        >${msg("Unlimited")}</span
                      >`
                    : html`<span class="text-sm text-neutral-400"
                        >${msg("Unset")}</span
                      >`;
                const fn =
                  labelConfig.type === "bytes"
                    ? this.localize.bytes
                    : this.localize.number;
                return fn(v);
              };

              return this.orgQuotaAdjustments[key]
                ? Math.sign(this.orgQuotaAdjustments[key]) === 1
                  ? html`<span>
                      <b>${format(value + this.orgQuotaAdjustments[key])}</b>
                      <span class="inline-block"
                        >(${format(value, false)}
                        <span class="text-green-600">
                          + ${format(this.orgQuotaAdjustments[key])}</span
                        >)</span
                      ></span
                    >`
                  : html`<span>
                      <b>${format(value + this.orgQuotaAdjustments[key])}</b>
                      <span class="inline-block"
                        >(${format(value, false)}
                        <span class="text-red-600">
                          - ${format(-this.orgQuotaAdjustments[key])}</span
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
        <sl-button
          size="small"
          @click="${this.onSubmitQuotas}"
          variant="primary"
          >${msg("Update Quotas")}
        </sl-button>
      </div>
    </btrix-dialog>`;

    // (Object.entries(quotas) as [keyof OrgQuotas, number][]).map(
    //             ([key, value]) => {
    //               let label: string;
    //               switch (key) {
    //                 case "maxConcurrentCrawls":
    //                   label = msg("Max Concurrent Crawls");
    //                   break;
    //                 case "maxPagesPerCrawl":
    //                   label = msg("Max Pages Per Crawl");
    //                   break;
    //                 case "storageQuota":
    //                   label = msg("Org Storage Quota (GB)");
    //                   value = Math.floor(value / 1e9);
    //                   break;
    //                 case "maxExecMinutesPerMonth":
    //                   label = msg("Max Execution Minutes Per Month");
    //                   break;
    //                 case "extraExecMinutes":
    //                   label = msg("Extra Execution Minutes");
    //                   break;
    //                 case "giftedExecMinutes":
    //                   label = msg("Gifted Execution Minutes");
    //                   break;
    //                 default:
    //                   label = msg("Unlabeled");
    //               }
    //               return html` ${msg("Current")}: ${value}
    //                 <sl-input
    //                   class="mb-3 last:mb-0"
    //                   name=${key}
    //                   label=${label}
    //                   value="0"
    //                   type="number"
    //                   @sl-input="${this.onUpdateQuota}"
    //                 ></sl-input>`;
    //             },
    //           ),
  }

  private onUpdateQuota(e: CustomEvent) {
    const inputEl = e.target as SlInput;
    const name = inputEl.name as keyof OrgData["quotas"];
    const quotas = this.activeOrg?.quotas;
    if (quotas) {
      if (name === "storageQuota") {
        quotas[name] = Number(inputEl.value) * 1e9;
      } else {
        quotas[name] = Number(inputEl.value);
      }
    }
  }

  private onSubmitQuotas() {
    if (this.activeOrg) {
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
