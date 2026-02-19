import clsx from "clsx";
import { css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * Alert used inline, e.g. for form server errors
 *
 * Usage example:
 * ```ts
 * <input aria-describedby="error_message" />
 * <btrix-alert id="error_message>${errorMessage}</btrix-alert>
 * ```
 */
@customElement("btrix-alert")
export class Alert extends TailwindElement {
  @property({ type: String })
  variant: "success" | "warning" | "danger" | "info" = "info";

  @state()
  open = true;

  static styles = css`
    :host {
      display: block;
    }
  `;

  public hide() {
    // TODO Animate for nicer transition
    this.open = false;
  }

  public show() {
    // TODO Animate for nicer transition
    this.open = true;
  }

  render() {
    if (!this.open) return;

    return html`<div
      class="${clsx(
        "px-3 py-2 rounded-lg border",
        {
          success: "bg-success-50 text-success-800 border-success-200",
          warning: "bg-warning-50 text-warning-800 border-warning-200",
          danger: "bg-danger-50 text-danger-800 border-danger-200",
          info: "bg-primary-50 text-primary-600 border-primary-100",
        }[this.variant],
      )}"
      role="alert"
      part="base"
    >
      <slot></slot>
    </div>`;
  }
}
