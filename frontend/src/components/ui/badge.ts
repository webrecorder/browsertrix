import { TailwindElement } from "@/classes/TailwindElement";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Show numeric value in a label
 *
 * Usage example:
 * ```ts
 * <btrix-badge aria-describedby="text">10</btrix-badge>
 * ```
 */
@customElement("btrix-badge")
export class Badge extends TailwindElement {
  @property({ type: String })
  variant:
    | "success"
    | "warning"
    | "danger"
    | "neutral"
    | "primary"
    | "high-contrast" = "neutral";

  render() {
    return html`
      <span
        class="h-4.5 ${{
          success: "bg-success-500 text-neutral-0",
          warning: "bg-warning-600 text-neutral-0",
          danger: "bg-danger-500 text-neutral-0",
          neutral: "bg-neutral-100 text-neutral-600",
          "high-contrast": "bg-neutral-600 text-neutral-0",
          primary: "bg-primary text-neutral-0",
        }[
          this.variant
        ]} inline-flex items-center justify-center rounded-sm px-2 align-[1px] text-xs"
      >
        <slot></slot>
      </span>
    `;
  }
}
