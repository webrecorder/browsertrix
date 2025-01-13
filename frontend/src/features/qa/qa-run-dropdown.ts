import { localized, msg } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type QARun } from "@/types/qa";

export type SelectDetail = { item: { id: string } };

/**
 * @fires btrix-select
 */
@customElement("btrix-qa-run-dropdown")
@localized()
export class QaRunDropdown extends BtrixElement {
  @property({ type: Array })
  items: QARun[] = [];

  @property({ type: String })
  selectedId?: string;

  render() {
    if (!this.items.length) return;

    const selectedRun = this.selectedId
      ? this.items.find(({ id }) => id === this.selectedId)
      : null;

    return html`
      <sl-dropdown @sl-select=${this.onSelect} distance="-2">
        <sl-button slot="trigger" variant="text" size="small" caret>
          ${selectedRun
            ? html`<btrix-crawl-status
                  type="qa"
                  hideLabel
                  state=${selectedRun.state}
                  slot="prefix"
                  hoist
                ></btrix-crawl-status>
                ${selectedRun.finished
                  ? this.localize.date(selectedRun.finished)
                  : msg("In progress")}`
            : msg("Select a QA run")}
        </sl-button>
        <sl-menu>
          ${this.items.map((run) => {
            const isSelected = selectedRun && run.id === selectedRun.id;
            return html`
              <sl-menu-item
                value=${run.id}
                type="checkbox"
                ?disabled=${isSelected}
                ?checked=${isSelected}
              >
                ${run.finished
                  ? this.localize.date(run.finished)
                  : msg("In progress")}
                <btrix-crawl-status
                  type="qa"
                  hideLabel
                  state=${run.state}
                  slot="prefix"
                  hoist
                ></btrix-crawl-status>
              </sl-menu-item>
            `;
          })}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private onSelect(e: SlSelectEvent) {
    e.stopPropagation();

    const id = e.detail.item.value;

    this.dispatchEvent(
      new CustomEvent<SelectDetail>("btrix-select", {
        detail: { item: { id } },
      }),
    );
  }
}
