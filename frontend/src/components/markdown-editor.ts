import { LitElement, html } from "lit";
import { state, property } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { createWysimark } from "@wysimark/standalone";

import { getHelpText } from "../utils/form";

export type MarkdownChangeEvent = CustomEvent<{
  value: string;
}>;

/**
 * Edit and preview text in markdown
 *
 * @event on-change MarkdownChangeEvent
 */
export class MarkdownEditor extends LitElement {
  @property({ type: String })
  initialValue = "";

  @property({ type: String })
  name = "markdown";

  @property({ type: Number })
  maxlength?: number;

  @state()
  value = "";

  createRenderRoot() {
    // Disable shadow DOM for styles to work
    return this;
  }

  protected willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("initialValue") && this.initialValue) {
      this.value = this.initialValue;
    }
  }

  protected firstUpdated(): void {
    const editor = createWysimark(this.querySelector(".markdown-editor")!, {
      initialMarkdown: this.initialValue,
      minHeight: "15rem",
      onChange: async () => {
        const value = editor.getMarkdown();
        const input = this.querySelector(
          `input[name=${this.name}]`
        ) as HTMLTextAreaElement;
        input.value = value;
        this.value = value;
        await this.updateComplete;
        this.dispatchEvent(
          <MarkdownChangeEvent>new CustomEvent("on-change", {
            detail: {
              value: value,
            },
          })
        );
      },
    });
  }

  render() {
    const isInvalid = this.maxlength && this.value.length > this.maxlength;
    return html`
      <fieldset
        class="markdown-editor-wrapper with-max-help-text"
        ?data-invalid=${isInvalid}
        ?data-user-invalid=${isInvalid}
      >
        <input name=${this.name} type="hidden" />
        ${guard(
          [this.initialValue],
          () => html`
            <style>
              .markdown-editor-wrapper[data-user-invalid] {
                --select-editor-color: var(--sl-color-danger-400);
              }
              .markdown-editor-wrapper[data-user-invalid]
                .markdown-editor
                > div {
                border: 1px solid var(--sl-color-danger-400);
              }
              .markdown-editor {
                --blue-100: var(--sl-color-blue-100);
              }
              /* NOTE Should open an issue with wysimark about customizing */
              .markdown-editor > div {
                overflow: hidden;
                border-radius: var(--sl-input-border-radius-medium);
                font-family: var(--sl-font-sans);
                font-size: 1rem;
              }
              .markdown-editor div[role="textbox"] {
                font-size: var(--sl-font-size-medium);
                padding: var(--sl-spacing-small) var(--sl-spacing-medium);
              }
            </style>
            <div class="markdown-editor font-sm"></div>
          `
        )}
        ${this.maxlength
          ? html`<div class="form-help-text">
              ${getHelpText(this.maxlength, this.value.length)}
            </div>`
          : ""}
      </fieldset>
    `;
  }
}
