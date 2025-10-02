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

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("schedule")) {
      this.dispatchEvent(
        new CustomEvent<BtrixChangeWorkflowScheduleFilterEvent["detail"]>(
          "btrix-change",
          {
            detail: { value: this.schedule },
          },
        ),
      );
    }
  }

  render() {
    return html`
      <btrix-filter-chip
        ?checked=${this.schedule !== undefined}
        selectFromDropdown
      >
        ${this.schedule === undefined
          ? msg("Schedule")
          : html`<span
              >${this.schedule ? msg("Scheduled") : msg("No Schedule")}</span
            >`}

        <div
          slot="dropdown-content"
          class="flex max-h-[var(--auto-size-available-height)] max-w-[var(--auto-size-available-width)] flex-col overflow-hidden rounded border bg-white text-left"
        >
          <header
            class="flex-shrink-0 flex-grow-0 overflow-hidden rounded-t border-b bg-white"
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
                      this.schedule = undefined;
                    }}
                    >${msg("Clear")}</sl-button
                  >`
                : nothing}
            </sl-menu-label>
          </header>

          <sl-radio-group
            value=${this.schedule
              ? ScheduleType.Scheduled
              : this.schedule === false
                ? ScheduleType.None
                : ScheduleType.Any}
            class="m-1"
            @sl-change=${(e: SlChangeEvent) => {
              const target = e.target as SlRadioGroup;

              switch (target.value as ScheduleType) {
                case ScheduleType.Scheduled:
                  this.schedule = true;
                  break;
                case ScheduleType.None:
                  this.schedule = false;
                  break;
                default:
                  this.schedule = undefined;
                  break;
              }
            }}
          >
            <sl-radio
              value=${ScheduleType.Scheduled}
              class="!mt-0 part-[base]:flex part-[base]:rounded part-[base]:p-2 part-[base]:hover:bg-primary-50"
              >${msg("Scheduled")}</sl-radio
            >
            <sl-radio
              value=${ScheduleType.None}
              class="!mt-0 part-[base]:flex part-[base]:rounded part-[base]:p-2 part-[base]:hover:bg-primary-50"
              >${msg("No Schedule")}</sl-radio
            >
          </sl-radio-group>
        </div>
      </btrix-filter-chip>
    `;
  }
}
