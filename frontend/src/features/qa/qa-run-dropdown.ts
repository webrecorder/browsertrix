import { localized, msg, str } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type QARun } from "@/types/qa";

export type SelectDetail = { item: { id: string } };

const inProgressLabel = msg("Analysis in progress");

/**
 * @fires btrix-select
 */
@customElement("btrix-qa-run-dropdown")
@localized()
export class QaRunDropdown extends BtrixElement {
  @property({ type: Array })
  items: QARun[] = [];

  @property({ type: String })
  crawlId?: string;

  @property({ type: String })
  selectedId?: string;

  render() {
    if (!this.items.length) return;

    if (this.items.length === 1) {
      const run = this.items[0];

      if (!run.finished) {
        const startedDate =
          run.started &&
          this.localize.date(run.started, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          });

        return html`<btrix-popover
          content=${msg(str`Analysis started on ${startedDate}`)}
        >
          <span class="inline-flex items-center gap-1.5">
            <btrix-crawl-status
              type="qa"
              hideLabel
              state=${run.state}
              slot="prefix"
              hoist
            ></btrix-crawl-status>
            <span class="text-neutral-600">${inProgressLabel}</span>
          </span>
        </btrix-popover>`;
      }
    }

    const selectedRun = this.selectedId
      ? this.items.find(({ id }) => id === this.selectedId)
      : null;

    const finishedDate =
      selectedRun?.finished &&
      this.localize.date(selectedRun.finished, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });

    const startedDate =
      selectedRun?.started &&
      this.localize.date(selectedRun.started, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });

    return html`
      <sl-dropdown @sl-select=${this.onSelect} distance="-2" hoist>
        <div slot="trigger">
          <btrix-popover
            placement="top"
            content=${finishedDate
              ? msg(str`Analysis finished on ${finishedDate}`)
              : msg(str`Analysis started on ${startedDate}`)}
            ?disabled=${!startedDate && !finishedDate}
          >
            <sl-button variant="text" size="small" caret>
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
                      : inProgressLabel}`
                : msg("Select Analysis Run")}
            </sl-button>
          </btrix-popover>
        </div>
        <sl-menu>
          ${this.items.map((run) => {
            const isSelected = selectedRun && run.id === selectedRun.id;
            return html`
              <sl-menu-item
                value=${run.id}
                type="checkbox"
                ?disabled=${!run.finished}
                ?checked=${isSelected}
              >
                ${run.finished
                  ? this.localize.date(run.finished)
                  : inProgressLabel}
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
