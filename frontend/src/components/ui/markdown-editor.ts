// cSpell:words wysimark

import { ink, type AwaitableInstance } from "ink-mde";
import { html, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
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
 * @event on-change MarkdownChangeEvent
 */
@customElement("btrix-markdown-editor")
export class MarkdownEditor extends TailwindElement {
  @property({ type: String })
  initialValue = "";

  @property({ type: String })
  name = "markdown";

  @property({ type: Number })
  maxlength?: number;

  @query('input[type="hidden"]')
  private readonly hiddenInput?: HTMLInputElement | null;

  private editor?: AwaitableInstance;

  protected updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("initialValue") && this.initialValue) {
      this.hiddenInput!.value = this.initialValue;
      if (this.editor) {
        this.editor.update(this.initialValue);
      }
    }
  }

  render() {
    const value = this.hiddenInput!.value;
    const isInvalid = this.maxlength && value.length > this.maxlength;
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
              ${getHelpText(this.maxlength, value.length)}
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
        afterUpdate: (doc: string) => {
          this.hiddenInput!.value = doc;
          console.log("doc:", doc);
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

    // const editor = createWysimark(this.querySelector(".markdown-editor")!, {
    //   initialMarkdown: this.initialValue,
    //   minHeight: "12rem",
    //   onChange: async () => {
    //     const value = editor.getMarkdown();
    //     const input = this.querySelector<HTMLTextAreaElement>(
    //       `input[name=${this.name}]`,
    //     );
    //     input!.value = value;
    //     this.value = value;
    //     await this.updateComplete;
    //     this.dispatchEvent(
    //       new CustomEvent<MarkdownChangeDetail>("on-change", {
    //         detail: {
    //           value: value,
    //         },
    //       }),
    //     );
    //   },
    // });
  }
}
