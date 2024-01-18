import { LitElement, html, css } from "lit";
import { property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";

export type TimeInputChangeEvent = CustomEvent<{
  hour: number;
  minute: number;
  period: "AM" | "PM";
}>;

/**
 * Usage:
 * ```ts
 * <btrix-time-input
 *   hour="1"
 *   minute="1"
 *   period="AM"
 *   @time-change=${console.log}
 * ></btrix-time-input>
 * ```
 *
 * @events
 * time-change TimeInputChangeEvent
 */
@localized()
@customElement("btrix-time-input")
export class TimeInput extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    fieldset {
      all: unset;
    }

    label {
      display: inline-block;
      color: var(--sl-input-label-color);
      font-size: var(--sl-input-label-font-size-medium);
      margin-bottom: var(--sl-spacing-3x-small);
    }

    .flex {
      display: flex;
      align-items: center;
    }

    .separator {
      padding: var(--sl-spacing-2x-small);
    }

    sl-input {
      width: 4rem;
    }

    sl-input::part(input) {
      text-align: center;
    }

    sl-select[name="period"] {
      margin-left: var(--sl-spacing-x-small);
    }
  `;

  @property({ type: Number })
  hour: number = new Date().getHours() % 12 || 12;

  @property({ type: Number })
  minute: number = 0;

  @property({ type: String })
  period: "AM" | "PM" = new Date().getHours() > 11 ? "PM" : "AM";

  @property({ type: Boolean })
  disabled = false;

  render() {
    return html`
      <fieldset name="time">
        <label><slot name="label">${msg("Time")}</slot></label>
        <div class="flex">
          <div class="flex">
            <sl-input
              name="hour"
              pattern="[0-9]*"
              maxlength="2"
              value=${this.hour}
              ?disabled=${this.disabled}
              required
              @sl-change=${async (e: Event) => {
                e.stopPropagation();
                const input = e.target as SlInput;
                if (input.value) {
                  const int = +input.value.replace(/[^0-9]/g, "");
                  input.value = `${Math.min(12, Math.max(1, int))}`;
                } else {
                  input.value = "12";
                }

                await input.updateComplete;
                this.hour = +input.value;
                this.dispatchChange();
              }}
            >
            </sl-input>
            <span class="separator">:</span>
            <sl-input
              name="minute"
              pattern="[0-9]*"
              maxlength="2"
              value=${`${this.minute}`.length === 1
                ? `${0}${this.minute}`
                : this.minute}
              ?disabled=${this.disabled}
              required
              @sl-change=${async (e: Event) => {
                e.stopPropagation();
                const input = e.target as SlInput;
                if (input.value) {
                  const int = Math.min(
                    59,
                    Math.max(0, +input.value.replace(/[^0-9]/g, ""))
                  );
                  input.value = int < 10 ? `0${int}` : `${int}`;
                } else {
                  input.value = "00";
                }

                await input.updateComplete;
                this.minute = +input.value;
                this.dispatchChange();
              }}
            >
            </sl-input>
          </div>
          <sl-select
            name="period"
            value=${this.period}
            ?disabled=${this.disabled}
            hoist
            @sl-hide=${this.stopProp}
            @sl-after-hide=${this.stopProp}
            @sl-change=${(e: any) => {
              e.stopPropagation();
              this.period = e.target.value;
              this.dispatchChange();
            }}
          >
            <sl-option value="AM"
              >${msg("AM", { desc: "Time AM/PM" })}</sl-option
            >
            <sl-option value="PM"
              >${msg("PM", { desc: "Time AM/PM" })}</sl-option
            >
          </sl-select>
        </div>
      </fieldset>
    `;
  }

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      <TimeInputChangeEvent>new CustomEvent("time-change", {
        detail: {
          hour: this.hour,
          minute: this.minute,
          period: this.period,
        },
      })
    );
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
