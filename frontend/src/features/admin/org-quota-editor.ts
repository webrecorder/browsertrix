import { localized, msg, str } from "@lit/localize";
import { type SlDialog, type SlInput } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { when } from "lit/directives/when.js";
import { type Entries } from "type-fest";

import { BtrixElement } from "@/classes/BtrixElement";
import { type OrgData, type OrgQuotas } from "@/types/org";

const LABELS = {
  maxConcurrentCrawls: {
    label: msg("Max Concurrent Crawls"),
  },
  maxPagesPerCrawl: {
    label: msg("Max Pages Per Crawl"),
  },
  storageQuota: {
    label: msg("Storage Quota"),
    adjust: (value) => Math.floor(value / 1e9),
  },
  maxExecMinutesPerMonth: {
    label: msg("Max Execution Minutes Per Month"),
  },
  extraExecMinutes: {
    label: msg("Extra Execution Minutes"),
  },
  giftedExecMinutes: {
    label: msg("Gifted Execution Minutes"),
  },
} satisfies {
  [key in keyof OrgQuotas]: {
    label: string;
    adjust?: (value: number) => number;
  };
} as const;

@customElement("btrix-org-quota-editor")
@localized()
export class OrgQuotaEditor extends BtrixElement {
  @property({ type: Object })
  activeOrg: OrgData | null = null;

  @state()
  orgQuotaAdjustments: Partial<OrgQuotas> = {};

  dialog: Ref<SlDialog> = createRef();

  render() {
    return html` <btrix-dialog
      ${ref(this.dialog)}
      .label=${msg(str`Quotas for: ${this.activeOrg?.name || ""}`)}
      @sl-after-hide=${() => {
        // TODO move to parent;
        this.activeOrg = null;
      }}
    >
      ${when(this.activeOrg?.quotas, (quotas) => {
        const entries = Object.entries(quotas) as Entries<typeof quotas>;
        return html`
          <btrix-data-grid
            .columns=${[
              {
                label: msg("Key"),
                field: "key",
                editable: false,
              },
              {
                label: msg("Current Value"),
                field: "current",
                editable: false,
              },
              { label: msg("Adjustment"), field: "adjustment", editable: true },
            ]}
            .items=${entries.map(([key, rawValue]) => {
              const value =
                "adjust" in LABELS[key]
                  ? LABELS[key].adjust(rawValue)
                  : rawValue;
              return [
                LABELS[key].label,
                html`
                  ${this.localize.number(value)}
                  ${this.orgQuotaAdjustments[key] &&
                  (Math.sign(this.orgQuotaAdjustments[key]) === 1
                    ? html`+
                      ${this.localize.number(this.orgQuotaAdjustments[key])} =
                      ${this.localize.number(
                        value + this.orgQuotaAdjustments[key],
                      )}`
                    : html`-
                      ${this.localize.number(this.orgQuotaAdjustments[key])} =
                      ${this.localize.number(
                        value + this.orgQuotaAdjustments[key],
                      )}`)}
                `,
              ];
            })}
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
