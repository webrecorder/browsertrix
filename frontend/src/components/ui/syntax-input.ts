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

  // FIXME Tooltips should be opt-in for inputs that are used in table cells
  // Should fix with https://github.com/webrecorder/browsertrix/issues/2497
  @property({ type: Boolean })
  disableTooltip = false;

  @state()
  private error = "";

  @query("sl-input")
  private readonly input?: SlInput | null;

  @query("sl-tooltip")
  public readonly tooltip?: SlTooltip | null;

  @query("btrix-code")
  private readonly code?: Code | null;

  public setCustomValidity(message: string) {
    this.input?.setCustomValidity(message);
    if (this.disableTooltip) {
      this.input?.setAttribute("help-text", message);
    }
    this.error = message;
  }

  public reportValidity() {
    if (this.input) {
      if (this.tooltip) {
        this.tooltip.disabled = true;
      }

      // Suppress tooltip validation from showing on focus
      this.input.addEventListener(
        "focus",
        async () => {
          await this.updateComplete;
          await this.input!.updateComplete;

          if (this.tooltip && !this.disableTooltip) {
            this.tooltip.disabled = !this.error;
          }
        },
        { once: true },
      );

      return this.input.reportValidity();
    }

    return this.checkValidity();
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
      ?disabled=${!this.error || this.disableTooltip}
      hoist
      placement="bottom"
    >
      <div class=${clsx(tw`relative`)} part="base">
        <sl-input
          class=${clsx(
            tw`[--sl-input-font-family:var(--sl-font-mono)] [--sl-input-spacing-medium:var(--sl-spacing-small)]`,
            tw`part-[base]:relative part-[base]:bg-transparent`,
            tw`part-[input]:relative part-[input]:z-10 part-[input]:text-transparent part-[input]:caret-black`,
            tw`part-[prefix]:absolute part-[prefix]:inset-0 part-[prefix]:mr-[var(--sl-input-spacing-medium)]`,
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
          @sl-change=${async () => {
            if (this.code) {
              await this.code.updateComplete;

              this.dispatchEvent(
                new CustomEvent("btrix-change", {
                  detail: { value: this.code.value },
                }),
              );
            }
          }}
        >
          <btrix-code
            slot="prefix"
            class=${clsx(
              tw`flex items-center overflow-auto [scrollbar-width:none]`,
              tw`part-[base]:whitespace-pre`,
            )}
            value=${this.value}
            language=${ifDefined(this.language)}
            aria-hidden="true"
          ></btrix-code>
        </sl-input>
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
