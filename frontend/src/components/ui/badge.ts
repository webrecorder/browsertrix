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
  | "cyan"
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

  @property({ type: Boolean })
  outline = false;

  @property({ type: Boolean })
  pill = false;

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
          tw`inline-flex h-[1.125rem] items-center justify-center align-[1px] text-xs`,
          this.outline
            ? [
                tw`ring-1`,
                {
                  success: tw`bg-success-500 text-success-500 ring-success-500`,
                  warning: tw`bg-warning-600 text-warning-600 ring-warning-600`,
                  danger: tw`bg-danger-500 text-danger-500 ring-danger-500`,
                  neutral: tw`g-neutral-100 text-neutral-600 ring-neutral-600`,
                  "high-contrast": tw`bg-neutral-600 text-neutral-0 ring-neutral-0`,
                  primary: tw`bg-white text-primary ring-primary`,
                  cyan: tw`bg-cyan-50 text-cyan-600 ring-cyan-600`,
                  blue: tw`bg-blue-50 text-blue-600 ring-blue-600`,
                }[this.variant],
              ]
            : {
                success: tw`bg-success-500 text-neutral-0`,
                warning: tw`bg-warning-600 text-neutral-0`,
                danger: tw`bg-danger-500 text-neutral-0`,
                neutral: tw`bg-neutral-100 text-neutral-600`,
                "high-contrast": tw`bg-neutral-600 text-neutral-0`,
                primary: tw`bg-primary text-neutral-0`,
                cyan: tw`bg-cyan-50 text-cyan-600`,
                blue: tw`bg-blue-50 text-blue-600`,
              }[this.variant],
          this.pill ? tw`min-w-[1.125rem] rounded-full px-1` : tw`rounded px-2`,
        )}
        part="base"
      >
        <slot></slot>
      </span>
    `;
  }
}
