import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlRadioGroup } from "@shoelace-style/shoelace";
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
    const radio = (label: string, value: string) => html`
      <sl-radio
        class="!mt-0 w-full part-[base]:w-full part-[base]:rounded part-[base]:p-2 part-[base]:hover:bg-primary-50"
        value=${value}
        >${label}</sl-radio
      >
    `;

    return html`
      <btrix-workflow-filter
        ?checked=${this.schedule !== undefined}
        select
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
          : html`<strong class="font-semibold"
              >${this.schedule ? msg("Scheduled") : msg("No Schedule")}</strong
            >`}

        <div
          slot="dropdown-header"
          class="flex items-center justify-between py-1"
        >
          <sl-menu-label class="part-[base]:px-4" id="schedule-list-label">
            ${msg("Filter by Schedule Type")}
          </sl-menu-label>
          ${this.schedule !== undefined
            ? html`<sl-button
                variant="text"
                size="small"
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
                >${msg("Clear Filter")}</sl-button
              >`
            : nothing}
        </div>

        <div slot="dropdown-content" class="p-1">
          <sl-radio-group
            @sl-change=${(e: SlChangeEvent) => {
              const { value } = e.target as SlRadioGroup;

              switch (value as ScheduleType) {
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
            value=${this.schedule === undefined
              ? ScheduleType.Any
              : this.schedule
                ? ScheduleType.Scheduled
                : ScheduleType.None}
          >
            ${radio(msg("Scheduled"), ScheduleType.Scheduled)}
            ${radio(msg("No Schedule"), ScheduleType.None)}
          </sl-radio-group>
        </div>
      </btrix-workflow-filter>
    `;
  }
}
