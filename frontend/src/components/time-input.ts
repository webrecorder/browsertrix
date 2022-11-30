import { LitElement, html, css } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

const hours = Array.from({ length: 12 }).map((x, i) => ({
  value: i + 1,
  label: `${i + 1}`,
}));
const minutes = Array.from({ length: 60 }).map((x, i) => ({
  value: i,
  label: `${i}`.padStart(2, "0"),
}));

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
 */
@localized()
export class TimeInput extends LitElement {
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
      padding: var(--sl-spacing-3x-small);
    }

    sl-select::part(menu) {
      overflow-x: hidden;
    }

    sl-select {
      min-width: 5em;
    }

    sl-select[name="period"] {
      margin-left: var(--sl-spacing-2x-small);
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
            <sl-select
              name="hour"
              value=${this.hour}
              ?disabled=${this.disabled}
              hoist
              size="small"
              @sl-hide=${this.stopProp}
              @sl-after-hide=${this.stopProp}
              @sl-select=${(e: any) => {
                this.hour = +e.target.value;
                this.dispatchChange();
              }}
            >
              ${hours.map(
                ({ value, label }) =>
                  html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
              )}
            </sl-select>
            <span class="separator">:</span>
            <sl-select
              name="minute"
              value=${this.minute}
              ?disabled=${this.disabled}
              hoist
              size="small"
              @sl-hide=${this.stopProp}
              @sl-after-hide=${this.stopProp}
              @sl-select=${(e: any) => {
                this.minute = +e.target.value;
                this.dispatchChange();
              }}
            >
              ${minutes.map(
                ({ value, label }) =>
                  html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
              )}
            </sl-select>
          </div>
          <sl-select
            name="period"
            value=${this.period}
            ?disabled=${this.disabled}
            hoist
            size="small"
            @sl-hide=${this.stopProp}
            @sl-after-hide=${this.stopProp}
            @sl-select=${(e: any) => {
              this.period = e.target.value;
              this.dispatchChange();
            }}
          >
            <sl-menu-item value="AM"
              >${msg("AM", { desc: "Time AM/PM" })}</sl-menu-item
            >
            <sl-menu-item value="PM"
              >${msg("PM", { desc: "Time AM/PM" })}</sl-menu-item
            >
          </sl-select>
        </div>
      </fieldset>
    `;
  }

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent("time-change", {
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
