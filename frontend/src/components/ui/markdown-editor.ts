// cSpell:words wysimark

import { ink, type AwaitableInstance } from "ink-mde";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { getHelpText } from "@/utils/form";

type MarkdownChangeDetail = {
  value: string;
};
export type MarkdownChangeEvent = CustomEvent<MarkdownChangeDetail>;

/**
 * Edit and preview text in markdown
 *
 * @fires btrix-change MarkdownChangeEvent
 */
@customElement("btrix-markdown-editor")
export class MarkdownEditor extends TailwindElement {
  static styles = css`
    .cm-announced {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }
  `;

  @property({ type: String })
  initialValue = "";

  @property({ type: String })
  value = "";

  @property({ type: String })
  name = "markdown";

  @property({ type: Number })
  maxlength?: number;

  private editor?: AwaitableInstance;

  // protected updated(changedProperties: PropertyValues<this>) {
  //   if (changedProperties.has("initialValue") && this.initialValue) {
  //     this.hiddenInput!.value = this.initialValue;
  //     if (this.editor) {
  //       this.editor.update(this.initialValue);
  //     }
  //   }
  // }

  render() {
    const isInvalid = this.maxlength && this.value.length > this.maxlength;
    return html`
      <fieldset
        class="markdown-editor-wrapper with-max-help-text"
        ?data-invalid=${isInvalid}
        ?data-user-invalid=${isInvalid}
      >
        <input name=${this.name} type="hidden" />
        <div
          class="markdown-editor font-sm"
          ${ref(this.initEditor as () => void)}
        ></div>
        ${this.maxlength
          ? html`<div class="form-help-text">
              ${getHelpText(this.maxlength, this.value.length)}
            </div>`
          : ""}
      </fieldset>
    `;
  }

  private initEditor(el: HTMLDivElement | null) {
    if (!el) return;

    this.editor = ink(el, {
      doc: this.initialValue,
      hooks: {
        afterUpdate: async (doc: string) => {
          this.value = doc;

          await this.updateComplete;

          this.dispatchEvent(
            new CustomEvent<MarkdownChangeDetail>("btrix-change", {
              detail: {
                value: doc,
              },
            }),
          );
        },
      },
      interface: {
        appearance: "light",
        attribution: false,
        autocomplete: false,
        toolbar: true,
      },
      toolbar: {
        bold: true,
        code: false,
        codeBlock: false,
        heading: true,
        image: false,
        italic: true,
        link: true,
        list: true,
        orderedList: true,
        quote: false,
        taskList: false,
        upload: false,
      },
    });
  }
}
