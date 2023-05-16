import { LitElement, html, css, PropertyValueMap } from "lit";
import { state, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
// import { micromark } from "micromark";
import { createWysimark } from "@wysimark/standalone/.dist/standalone.js";

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

  createRenderRoot() {
    return this;
  }

  protected firstUpdated(): void {
    const editor = createWysimark(this.querySelector(".editor")!, {
      initialMarkdown: this.initialValue,
      onChange: () => {
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
    return html`<div class="editor"></div>`;
  }
}
