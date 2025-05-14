import clsx from "clsx";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "primary"
  | "blue"
  | "high-contrast";

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
  variant: BadgeVariant = "neutral";

  @property({ type: String, reflect: true })
  role: string | null = "status";

  static styles = css`
    :host {
      display: inline-flex;
    }
  `;

  render() {
    return html`
      <span
        class=${clsx(
          tw`h-4.5 inline-flex items-center justify-center rounded-sm px-2 align-[1px] text-xs`,
          {
            success: tw`bg-success-500 text-neutral-0`,
            warning: tw`bg-warning-600 text-neutral-0`,
            danger: tw`bg-danger-500 text-neutral-0`,
            neutral: tw`bg-neutral-100 text-neutral-600`,
            "high-contrast": tw`bg-neutral-600 text-neutral-0`,
            primary: tw`bg-primary text-neutral-0`,
            blue: tw`bg-cyan-50 text-cyan-600`,
          }[this.variant],
        )}
        part="base"
      >
        <slot></slot>
      </span>
    `;
  }
}
