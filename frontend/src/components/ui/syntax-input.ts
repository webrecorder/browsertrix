import { localized } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { live } from "lit/directives/live.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Code } from "@/components/ui/code";
import { tw } from "@/utils/tailwind";

export type SyntaxInputChangeEventDetail = {
  value: string;
};

/**
 * Basic text input with code syntax highlighting
 *
 * @fires btrix-change
 */
@customElement("btrix-syntax-input")
@localized()
export class SyntaxInput extends TailwindElement {
  @property({ type: String })
  value = "";

  @property({ type: String })
  language?: Code["language"];

  @property({ type: String })
  placeholder?: string;

  @query("btrix-code")
  private readonly code?: Code;

  render() {
    const classes = tw`px-3 leading-[var(--sl-input-height-medium)]`;

    return html`<div
      class="relative h-[var(--sl-input-height-medium)] w-full overflow-x-auto overflow-y-hidden transition-colors focus-within:bg-cyan-50/40"
    >
      <div
        class=${clsx(
          tw`font-monospace relative z-10 whitespace-nowrap text-black/0 caret-black focus:outline-none`,
          tw`before:font-light before:text-[var(--sl-input-placeholder-color)] empty:before:inline-block empty:before:content-[attr(data-placeholder)]`,
          classes,
        )}
        data-placeholder=${this.placeholder || ""}
        contenteditable="plaintext-only"
        autocapitalize="off"
        spellcheck="false"
        aria-autocomplete="none"
        .innerText=${live(this.value)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        }}
        @input=${(e: InputEvent) => {
          const el = e.target as HTMLDivElement;
          const value = el.textContent ? el.textContent.trim() : "";

          this.code!.value = value;
        }}
        @focusout=${async () => {
          await this.updateComplete;

          if (this.code && this.code.value !== this.value) {
            this.dispatchEvent(
              new CustomEvent<SyntaxInputChangeEventDetail>("btrix-change", {
                detail: { value: this.code.value },
              }),
            );
          }
        }}
      ></div>
      <btrix-code
        class=${clsx(tw`absolute inset-0`, classes)}
        value=${this.value}
        language=${ifDefined(this.language)}
        .wrap=${false}
        aria-hidden="true"
      ></btrix-code>
    </div> `;
  }
}
