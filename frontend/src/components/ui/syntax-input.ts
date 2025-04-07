import { localized } from "@lit/localize";
import type {
  SlInput,
  SlInputEvent,
  SlTooltip,
} from "@shoelace-style/shoelace";
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

  @property({ type: Boolean })
  required?: boolean;

  @property({ type: Boolean })
  disabled?: boolean;

  @property({ type: String })
  placeholder?: string;

  @property({ type: String })
  name?: string;

  @property({ type: String })
  label?: string;

  @property({ type: String })
  language?: Code["language"];

  @state()
  private error = "";

  @query("sl-input")
  public readonly input?: SlInput | null;

  @query("sl-tooltip")
  public readonly tooltip?: SlTooltip | null;

  @query("btrix-code")
  private readonly code?: Code | null;

  public setCustomValidity(message: string) {
    this.input?.setCustomValidity(message);
    this.error = message;
  }

  public reportValidity() {
    const valid = this.checkValidity();

    if (this.input && this.tooltip) {
      this.tooltip.disabled = true;

      // Suppress tooltip validation from showing on focus
      this.input.addEventListener(
        "focus",
        async () => {
          await this.updateComplete;
          await this.input!.updateComplete;
          this.tooltip!.disabled = !this.error;
        },
        { once: true },
      );

      this.input.reportValidity();
    }

    return valid;
  }

  public checkValidity() {
    if (!this.input?.input) {
      if (this.required) {
        return false;
      }

      return true;
    }

    return this.input.checkValidity();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("selectionchange", this.onSelectionChange);
  }

  render() {
    return html`<sl-tooltip
      content=${this.error}
      ?disabled=${!this.error}
      hoist
      placement="bottom"
    >
      <div class=${clsx(tw`relative`)} part="base">
        <sl-input
          class=${clsx(
            tw`relative z-10 block`,
            tw`[--sl-input-font-family:var(--sl-font-mono)] [--sl-input-spacing-medium:var(--sl-spacing-small)]`,
            tw`caret-black part-[base]:bg-transparent part-[input]:text-transparent`,
          )}
          spellcheck="false"
          value=${this.value}
          name=${ifDefined(this.name)}
          label=${ifDefined(this.label)}
          minlength=${ifDefined(this.minlength)}
          maxlength=${ifDefined(this.maxlength)}
          placeholder=${ifDefined(this.placeholder)}
          ?required=${this.required}
          ?disabled=${this.disabled}
          @sl-input=${async (e: SlInputEvent) => {
            const value = (e.target as SlInput).value;

            this.setCustomValidity("");

            if (this.code) {
              this.code.value = value;

              await this.code.updateComplete;

              this.dispatchEvent(
                new CustomEvent("btrix-change", {
                  detail: { value },
                }),
              );

              void this.scrollSync({ pad: true });
            }
          }}
          @sl-focus=${() => {
            if (!this.input?.input) return;

            // For Firefox
            this.input.input.addEventListener(
              "selectionchange",
              this.onSelectionChange,
            );
            // Non-Firefox
            document.addEventListener(
              "selectionchange",
              this.onSelectionChange,
            );
          }}
          @sl-blur=${() => {
            this.input?.input.removeEventListener(
              "selectionchange",
              this.onSelectionChange,
            );
            document.removeEventListener(
              "selectionchange",
              this.onSelectionChange,
            );
          }}
        ></sl-input>

        <btrix-code
          class=${clsx(
            tw`absolute inset-x-px bottom-0 flex h-[var(--sl-input-height-medium)] items-center overflow-auto px-3 [scrollbar-width:none]`,
            tw`part-[base]:whitespace-pre`,
          )}
          value=${this.value}
          language=${ifDefined(this.language)}
          aria-hidden="true"
        ></btrix-code>
      </div>
    </sl-tooltip>`;
  }

  private readonly onSelectionChange = () => {
    void this.scrollSync();
  };

  private readonly scrollSync = async (opts?: { pad: boolean }) => {
    await this.input?.updateComplete;

    const innerInput = this.input?.input;

    if (!innerInput || !this.code) return;

    // TODO Calculate single character width from actual font
    const ch = 8;

    // Pad scroll left when moving forward to prevent
    // delay in cursor moving to the correct position
    this.code.scrollLeft = innerInput.scrollLeft + (opts?.pad ? ch : 0);
  };
}
