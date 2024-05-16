import SlInput from "@shoelace-style/shoelace/dist/components/input/input.js";
import { css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Input to use inline with text.
 */
@customElement("btrix-inline-input")
export class InlineInput extends SlInput {
  static styles = [
    SlInput.styles,
    css`
      :host {
        --sl-input-height-small: var(--sl-font-size-x-large);
        --sl-input-color: var(--sl-color-neutral-500);
      }

      .input--small .input__control {
        text-align: center;
        padding: 0 0.5ch;
      }
    `,
  ];
}
