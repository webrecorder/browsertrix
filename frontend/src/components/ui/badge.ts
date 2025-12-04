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
  | "lime"
  | "cyan"
  | "blue"
  | "violet"
  | "orange"
  | "high-contrast"
  | "text"
  | "text-neutral";

/**
 * Badges are compact, non-interactive displays of contextual information.
 * They are an unobtrusive way of drawing attention to dynamic data like statuses or counts.
 */
@customElement("btrix-badge")
export class Badge extends TailwindElement {
  @property({ type: String })
  variant: BadgeVariant = "neutral";

  @property({ type: String })
  size?: "medium" | "large" = "medium";

  @property({ type: Boolean })
  outline = false;

  @property({ type: Boolean })
  pill = false;

  @property({ type: String, reflect: true })
  role: string | null = "status";

  /**
   * Style as normal text and not data
   */
  @property({ type: Boolean })
  asLabel = false;

  static styles = css`
    :host {
      display: inline-flex;
    }
  `;

  render() {
    return html`
      <span
        class=${clsx(
          tw`inline-flex min-h-4 items-center justify-center whitespace-nowrap leading-none`,
          this.asLabel
            ? [this.size === "medium" && tw`text-xs`]
            : [
                tw`font-mono [font-variation-settings:var(--font-monostyle-variation)]`,
                this.size === "medium" && tw`text-xs`,
              ],
          this.outline
            ? [
                tw`mx-px ring-1`,
                {
                  success: tw`bg-success-50 text-success-700 ring-success-400`,
                  warning: tw`bg-warning-50 text-warning-600 ring-warning-600`,
                  danger: tw`bg-danger-50 text-danger-500 ring-danger-500`,
                  neutral: tw`bg-neutral-100 text-neutral-600 ring-neutral-300`,
                  "high-contrast": tw`bg-neutral-0 text-neutral-700 ring-neutral-600`,
                  primary: tw`bg-white text-primary ring-primary`,
                  lime: tw`bg-lime-50 text-lime-600 ring-lime-600`,
                  cyan: tw`bg-cyan-50 text-cyan-600 ring-cyan-600`,
                  blue: tw`bg-blue-50 text-blue-600 ring-blue-600`,
                  text: tw`text-blue-500 ring-blue-600`,
                  violet: tw`bg-violet-50 text-violet-600 ring-violet-600`,
                  orange: tw`bg-orange-50 text-orange-600 ring-orange-600`,
                  "text-neutral": tw`text-neutral-500 ring-neutral-600`,
                }[this.variant],
              ]
            : {
                success: tw`bg-success-600 text-neutral-0`,
                warning: tw`bg-warning-600 text-neutral-0`,
                danger: tw`bg-danger-500 text-neutral-0`,
                neutral: tw`bg-neutral-100 text-neutral-600`,
                "high-contrast": tw`bg-neutral-600 text-neutral-0`,
                primary: tw`bg-primary text-neutral-0`,
                lime: tw`bg-lime-50 text-lime-600`,
                cyan: tw`bg-cyan-50 text-cyan-600`,
                blue: tw`bg-blue-50 text-blue-600`,
                violet: tw`bg-violet-50 text-violet-600`,
                orange: tw`bg-orange-50 text-orange-600`,
                text: tw`text-blue-500`,
                "text-neutral": tw`text-neutral-500`,
              }[this.variant],
          this.pill
            ? [
                tw`min-w-[1.125rem] rounded-full px-2`,
                this.size === "large" && tw`py-0.5`,
              ]
            : [tw`rounded`, this.size === "large" ? tw`px-2.5 py-1` : tw`px-2`],
        )}
        part="base"
      >
        <slot></slot>
      </span>
    `;
  }
}
