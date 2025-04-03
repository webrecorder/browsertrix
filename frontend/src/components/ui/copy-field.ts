import { localized } from "@lit/localize";
import clsx from "clsx";
import { css, html } from "lit";
import { customElement, property, queryAssignedNodes } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * Copy text to clipboard on click
 *
 * @example
 * ```ts
 * <btrix-copy-field label="my field" value=${value}></btrix-copy-field>
 * ```
 */
@customElement("btrix-copy-field")
@localized()
export class CopyField extends TailwindElement {
  @property({ type: String })
  value?: string;

  @property({ type: Boolean })
  hideContentFromScreenReaders = false;

  @property({ type: String })
  buttonIconName?: string;

  @property({ type: String })
  buttonContent?: string;

  @property({ attribute: false })
  getValue?: () => string | undefined;

  @property({ type: Boolean })
  hoist = false;

  @property({ type: Boolean })
  border = true;

  @property({ type: Boolean })
  monostyle = true;

  @property({ type: Boolean })
  filled = this.monostyle;

  @property()
  label?: string;

  static styles = css`
    :host {
      display: block;
    }
  `;

  @queryAssignedNodes({ slot: "label" })
  private readonly slottedChildren: Element[] | undefined;

  render() {
    return html`
      <label
        class="${clsx(
          "mb-1.5 inline-block font-sans text-xs leading-[1.4] text-neutral-800",
          !this.label && !this.slottedChildren?.length && tw`hidden`,
        )} "
        ><slot name="label">${this.label}</slot></label
      >
      <div
        role="group"
        class=${clsx(
          this.border && tw`rounded border`,
          this.filled ? tw`bg-slate-50` : tw`border-neutral-150`,
          this.monostyle && tw`font-monostyle`,
        )}
      >
        <div class="relative inline-flex w-full items-stretch justify-start">
          <slot name="prefix"></slot>
          <span
            aria-hidden=${this.hideContentFromScreenReaders}
            class="mx-1.5 flex-auto select-all self-center overflow-x-auto whitespace-nowrap px-1.5 text-neutral-700"
          >
            ${this.value}
          </span>
          <btrix-copy-button
            .value=${this.value}
            .name=${this.buttonIconName}
            .content=${this.buttonContent}
            .getValue=${this.getValue}
            .hoist=${this.hoist}
            class="m-1 flex"
            raised
          ></btrix-copy-button>
        </div>
      </div>
    `;
  }
}
