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

  protected updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("initialValue") && this.initialValue) {
      this.value = this.initialValue;
      this.initEditor();
    }
  }

  protected firstUpdated(): void {
    if (!this.initialValue) {
      this.initEditor();
    }
  }

  render() {
    const isInvalid = this.maxlength && this.value.length > this.maxlength;
    return html`
      <fieldset
        class="markdown-editor-wrapper with-max-help-text"
        ?data-invalid=${isInvalid}
        ?data-user-invalid=${isInvalid}
      >
        <input name=${this.name} type="hidden" value="${this.value}" />
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
              /* NOTE wysimark doesn't support customization or
              a way of selecting elements as of 2.2.15
              https://github.com/portive/wysimark/issues/10 */
              /* Editor container: */
              .markdown-editor > div {
                /* overflow: hidden; */
                border-radius: var(--sl-input-border-radius-medium);
                font-family: var(--sl-font-sans);
                font-size: 1rem;
              }
              /* Dropdown appended to body: */
              .--icon svg {
                top: 0 !important;
              }
              /* Hide unsupported button features */
              /* Text styles: */
              .markdown-editor > div > div > div:nth-child(5),
              /* Table: */
              .markdown-editor > div > div > div:nth-child(9) {
                display: none !important;
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

  private initEditor() {
    const editor = createWysimark(this.querySelector(".markdown-editor")!, {
      initialMarkdown: this.initialValue,
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
}
