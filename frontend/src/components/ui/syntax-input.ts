import { localized } from "@lit/localize";
import type { SlInput, SlInputEvent } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Code } from "@/components/ui/code";
import { tw } from "@/utils/tailwind";

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

  @property({ type: Number })
  minlength = 1;

  @property({ type: Number })
  maxlength?: number;

  @property({ type: String })
  language?: Code["language"];

  @property({ type: String })
  placeholder?: string;

  @state()
  private error = "";

  @query("sl-input")
  public readonly input?: SlInput;

  @query("btrix-code")
  private readonly code?: Code;

  private scrollSyncedOnInput = true;

  public setCustomValidity(message: string) {
    this.input?.setCustomValidity(message);
    this.error = message;
  }

  render() {
    return html`<sl-tooltip
      content=${this.error}
      ?disabled=${!this.error}
      hoist
      placement="bottom"
    >
      <div class=${clsx(tw`relative overflow-hidden p-px`)}>
        <sl-input
          class=${clsx(
            tw`relative z-10 block`,
            tw`[--sl-input-border-color:transparent] [--sl-input-border-radius-medium:0] [--sl-input-font-family:var(--sl-font-mono)] [--sl-input-spacing-medium:var(--sl-spacing-small)]`,
            tw`caret-black part-[base]:bg-transparent part-[input]:text-transparent`,
          )}
          spellcheck="false"
          value=${this.value}
          minlength=${ifDefined(this.minlength)}
          maxlength=${ifDefined(this.maxlength)}
          placeholder=${ifDefined(this.placeholder)}
          required
          @sl-input=${async (e: SlInputEvent) => {
            const value = (e.target as SlInput).value;

            this.setCustomValidity("");

            this.scrollSyncedOnInput = true;

            if (this.code) {
              this.code.value = value;

              await this.code.updateComplete;

              this.scrollSync({ pad: true });
            }
          }}
          @focus=${this.scrollSync}
          @keydown=${() => {
            this.scrollSyncedOnInput = false;
          }}
          @keyup=${() => {
            // TODO Could maybe select and selectionchange events instead?
            if (!this.scrollSyncedOnInput) {
              this.scrollSync();
            }
          }}
          @mousedown=${this.scrollSync}
          @mouseup=${this.scrollSync}
        ></sl-input>

        <btrix-code
          class=${clsx(
            tw`absolute inset-0.5 flex items-center overflow-auto px-3 [scrollbar-width:none]`,
          )}
          value=${this.value}
          language=${ifDefined(this.language)}
          .wrap=${false}
          aria-hidden="true"
        ></btrix-code>
      </div>
    </sl-tooltip>`;
  }

  private readonly scrollSync = (opts?: { pad: boolean }) => {
    const innerInput = this.input?.input;

    if (!innerInput || !this.code) return;

    // TODO Calculate single character width from actual font
    const ch = 8;

    // Pad scroll left when moving forward to prevent
    // delay in cursor moving to the correct position

    this.code.scrollLeft =
      innerInput.scrollLeft +
      (opts?.pad && innerInput.selectionDirection === "forward" ? ch : 0);
  };
}
