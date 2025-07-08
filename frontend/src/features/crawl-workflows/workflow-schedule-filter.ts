import { localized, msg } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";

export type BtrixChangeWorkflowScheduleFilterEvent = BtrixChangeEvent<
  undefined | boolean
>;

enum ScheduleType {
  Scheduled = "Scheduled",
  None = "None",
  Any = "Any",
}

/**
 * @fires btrix-change
 */
@customElement("btrix-workflow-schedule-filter")
@localized()
export class WorkflowScheduleFilter extends BtrixElement {
  @property({ type: Boolean })
  schedule?: boolean;

  #schedule?: boolean;

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("schedule")) {
      this.#schedule = this.schedule;
    }
  }

  render() {
    const option = (label: string, value: string) => html`
      <sl-menu-item value=${value}>${label}</sl-menu-item>
    `;

    return html`
      <btrix-filter-chip
        ?checked=${this.schedule !== undefined}
        selectFromDropdown
        @sl-after-hide=${() => {
          if (this.#schedule !== this.schedule) {
            this.dispatchEvent(
              new CustomEvent<BtrixChangeWorkflowScheduleFilterEvent["detail"]>(
                "btrix-change",
                {
                  detail: { value: this.#schedule },
                },
              ),
            );
          }
        }}
      >
        ${this.schedule === undefined
          ? msg("Schedule")
          : html`<span
              >${this.schedule ? msg("Scheduled") : msg("No Schedule")}</span
            >`}

        <sl-menu
          slot="dropdown-content"
          class="pt-0"
          @sl-select=${(e: SlSelectEvent) => {
            const { item } = e.detail;

            switch (item.value as ScheduleType) {
              case ScheduleType.Scheduled:
                this.#schedule = true;
                break;
              case ScheduleType.None:
                this.#schedule = false;
                break;
              default:
                this.#schedule = undefined;
                break;
            }
          }}
        >
          <sl-menu-label
            class="part-[base]:flex part-[base]:items-center part-[base]:justify-between part-[base]:gap-4 part-[base]:px-3"
          >
            <div
              id="schedule-list-label"
              class="leading-[var(--sl-input-height-small)]"
            >
              ${msg("Filter by Schedule Type")}
            </div>
            ${this.schedule !== undefined
              ? html`<sl-button
                  variant="text"
                  size="small"
                  class="part-[label]:px-0"
                  @click=${() => {
                    this.dispatchEvent(
                      new CustomEvent<BtrixChangeEvent["detail"]>(
                        "btrix-change",
                        {
                          detail: {
                            value: undefined,
                          },
                        },
                      ),
                    );
                  }}
                  >${msg("Clear")}</sl-button
                >`
              : nothing}
          </sl-menu-label>

          ${option(msg("Scheduled"), ScheduleType.Scheduled)}
          ${option(msg("No Schedule"), ScheduleType.None)}
        </sl-menu>
      </btrix-filter-chip>
    `;
  }
}
