import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type Entries } from "type-fest";

import { BtrixElement } from "@/classes/BtrixElement";
import { cellInputStyle } from "@/components/ui/data-grid/data-grid-cell";
import { type RowEditEventDetail } from "@/components/ui/data-grid/data-grid-row";
import {
  GridColumnType,
  type GridColumn,
} from "@/components/ui/data-grid/types";
import { isNotEqual } from "@/utils/is-not-equal";
import { type OrgData, type OrgQuotas } from "@/utils/orgs";
import { tw } from "@/utils/tailwind";

export const emptyQuotas: OrgQuotas = {
  extraExecMinutes: 0,
  giftedExecMinutes: 0,
  maxConcurrentCrawls: 0,
  maxExecMinutesPerMonth: 0,
  maxPagesPerCrawl: 0,
  storageQuota: 0,
};

export const LABELS: {
  [key in keyof OrgQuotas]: {
    label: string;
    type: "number" | "bytes";
    scale?: number;
    adjustmentOnly?: boolean;
  };
} = {
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
    adjustmentOnly: true,
  },
  giftedExecMinutes: {
    label: msg("Gifted Execution Minutes"),
    type: "number",
    adjustmentOnly: true,
  },
};

@customElement("btrix-org-quota-form")
@localized()
export class OrgQuotaForm extends BtrixElement {
  @property({ type: Object })
  activeOrg: OrgData | null = null;

  @property({ type: Object })
  adjustments: Partial<OrgQuotas> = {};

  @state({ hasChanged: isNotEqual })
  private values: OrgQuotas = emptyQuotas;

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("activeOrg")) {
      this.reset();
    }
  }

  render() {
    return this.activeOrg ? this.renderAdjustMode() : this.renderSetMode();
  }

  reset() {
    this.values = this.activeOrg?.quotas ?? emptyQuotas;
  }

  private get quotas() {
    return this.activeOrg?.quotas ?? emptyQuotas;
  }

  private renderSetMode() {
    type Item = { key: keyof OrgQuotas; value: number };

    const items = (
      Object.entries(this.values) as Entries<typeof this.values>
    ).map(([key, value]) => ({ key, value }));

    const columns: GridColumn<Item>[] = [
      {
        label: msg("Quota"),
        field: "key",
        editable: false,
        width: "2fr",
        renderCell: ({ item }) =>
          html`<span class="font-medium">${LABELS[item.key].label}</span>`,
        align: "start",
      },
      {
        label: msg("Value"),
        field: "value",
        editable: true,
        width: "1fr",
        inputType: GridColumnType.Number,
        renderEditCell: ({ item }) => this.renderValueInput(item.key),
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
          if (labelConfig.scale != undefined) {
            value = Math.floor(value * labelConfig.scale);
          }
          this.values = { ...this.values, [key]: value };
          this.dispatchChange({ quotas: this.values });
        }}
      ></btrix-data-grid>
    `;
  }

  private renderAdjustMode() {
    const quotas = this.quotas;
    const entries = Object.entries(quotas) as Entries<typeof quotas>;
    const items = entries.map(([key, value]) => {
      const labelConfig = LABELS[key];
      let currentAdjustment = this.adjustments[key] ?? 0;
      if (labelConfig.scale != undefined) {
        currentAdjustment = Math.floor(currentAdjustment / labelConfig.scale);
      }
      return {
        key: key,
        initialValue: value,
        adjustment: currentAdjustment,
        currentValue: value + (this.adjustments[key] ?? 0),
      };
    });

    type Item = (typeof items)[number];

    const columns: GridColumn<Item>[] = [
      {
        label: msg("Quota"),
        field: "key",
        editable: false,
        width: "2fr",
        renderCell: ({ item }) =>
          html`<span class="font-medium">${LABELS[item.key].label}</span>`,
        align: "start",
      },
      {
        label: msg("Initial Value"),
        field: "initialValue",
        editable: false,
        width: "1fr",
        renderCell: ({ item: { key, initialValue } }) =>
          html`<span class="text-xs text-neutral-600"
            >${this.format(initialValue, LABELS[key].type, {
              asNumber: true,
            })}</span
          >`,
      },
      {
        label: msg("Adjustment"),
        field: "adjustment",
        editable: true,
        width: "1fr",
        inputType: GridColumnType.Number,
        renderEditCell: ({ item }) => {
          const key = item.key;
          let value = this.adjustments[key] ?? 0;
          const labelConfig = LABELS[key];

          if (labelConfig.scale != undefined) {
            value = Math.floor(value / labelConfig.scale);
          }
          return html`<sl-input
            class=${clsx(
              cellInputStyle,
              value !== 0 &&
                (value > 0
                  ? tw`text-green-600 part-[input]:text-green-600`
                  : tw`text-red-600 part-[input]:text-red-600`),
            )}
            type="number"
            value="${value}"
            min=${-1 * item.initialValue}
            step="1"
          >
            ${value > 0
              ? html`<span
                  slot="prefix"
                  class="relative z-10 -mr-[--sl-spacing-x-small] ml-[--sl-spacing-x-small]"
                  >+</span
                >`
              : null}
            ${labelConfig.type === "bytes"
              ? html`<span
                  class="relative z-10 -ml-[--sl-spacing-x-small] mr-[--sl-spacing-x-small]"
                  slot="suffix"
                  >GB</span
                >`
              : null}
          </sl-input>`;
        },
      },
      {
        label: msg("New Value"),
        field: "currentValue",
        editable: (item) => item && !LABELS[item.key].adjustmentOnly,
        inputType: GridColumnType.Number,
        width: "1fr",
        renderCell: ({ item: { key, currentValue: current } }) =>
          html`<span class="cursor-not-allowed"
            >${this.format(current, LABELS[key].type, {
              asNumber: true,
            })}</span
          >`,
        renderEditCell: ({ item, value: _value }) => {
          const key = item.key;
          let value = _value as number;
          const labelConfig = LABELS[key];

          if (labelConfig.scale != undefined) {
            value = Math.floor(value / labelConfig.scale);
          }
          return html`<sl-input
            class=${clsx(cellInputStyle)}
            type="number"
            value="${value}"
            min="0"
            step="1"
          >
            ${labelConfig.type === "bytes"
              ? html`<span class="whitespace-nowrap" slot="suffix">GB</span>`
              : ""}
          </sl-input>`;
        },
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
          if (labelConfig.scale != undefined) {
            value = Math.floor(value * labelConfig.scale);
          }
          let newAdjustments = this.adjustments;
          if (event.detail.field === "adjustment") {
            newAdjustments = { ...this.adjustments, [key]: value };
          } else if (event.detail.field === "currentValue") {
            newAdjustments = {
              ...this.adjustments,
              [key]: value - quotas[key],
            };
          }
          this.dispatchChange({ adjustments: newAdjustments });
        }}
      ></btrix-data-grid>
    `;
  }

  private renderValueInput(key: keyof OrgQuotas) {
    let value = this.values[key];
    const labelConfig = LABELS[key];

    if (labelConfig.scale != undefined) {
      value = Math.floor(value / labelConfig.scale);
    }

    return html`<sl-input
      class=${clsx(cellInputStyle)}
      type="number"
      value="${value}"
      min="0"
      step="1"
    >
      ${labelConfig.type === "bytes"
        ? html`<span class="whitespace-nowrap" slot="suffix">GB</span>`
        : ""}
    </sl-input>`;
  }

  private dispatchChange(
    detail: { quotas: OrgQuotas } | { adjustments: Partial<OrgQuotas> },
  ) {
    this.dispatchEvent(
      new CustomEvent("btrix-change", {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
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
}
