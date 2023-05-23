import { LitElement, html } from "lit";
import { state, property } from "lit/decorators.js";
import { createWysimark } from "@wysimark/standalone";

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

  createRenderRoot() {
    // Disable shadow DOM for styles to work
    return this;
  }

  protected firstUpdated(): void {
    const editor = createWysimark(this.querySelector(".markdown-editor")!, {
      initialMarkdown: this.initialValue,
      onChange: () => {
        const text = editor.getMarkdown();
        const input = this.querySelector(
          `input[name=${this.name}]`
        ) as HTMLTextAreaElement;
        if (input) {
          input.value = text;
        }
        this.dispatchEvent(
          <MarkdownChangeEvent>new CustomEvent("on-change", {
            detail: {
              value: editor.getMarkdown(),
            },
          })
        );
      },
    });
  }

  render() {
    return html`
      <style>
        .markdown-editor {
          --blue-100: var(--sl-color-blue-100);
        }
        /* NOTE Should open an issue with wysimark */
        .markdown-editor > div {
          overflow: hidden;
          border-radius: var(--sl-input-border-radius-medium);
        }
      </style>
      <input name=${this.name} type="hidden" />
      <div class="markdown-editor font-sm"></div>
    `;
  }
}
