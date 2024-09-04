import { msg, str } from "@lit/localize";
import { wrap, type AwaitableInstance } from "ink-mde";
import { css, html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { getHelpText } from "@/utils/form";
import { formatNumber } from "@/utils/localization";

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
    /* TODO check why style wasn't applied */
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

  @query("textarea")
  private readonly textarea?: HTMLTextAreaElement | null;

  private editor?: AwaitableInstance;

  public checkValidity() {
    return this.textarea?.checkValidity();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    this.editor?.destroy();
  }

  render() {
    const isInvalid = this.maxlength && this.value.length > this.maxlength;
    return html`
      <fieldset
        class="with-max-help-text"
        ?data-invalid=${isInvalid}
        ?data-user-invalid=${isInvalid}
      >
        <textarea
          name=${this.name}
          ${ref(this.initEditor as () => void)}
        ></textarea>
        ${this.maxlength
          ? html`<div class="form-help-text">
              ${getHelpText(this.maxlength, this.value.length)}
            </div>`
          : ""}
      </fieldset>
    `;
  }

  private initEditor(el: HTMLTextAreaElement | null) {
    if (!el) return;

    if (this.editor) {
      this.editor.destroy();
    }

    this.editor = wrap(el, {
      doc: this.initialValue,
      hooks: {
        beforeUpdate: (doc: string) => {
          if (this.maxlength) {
            this.textarea?.setCustomValidity(
              doc.length > this.maxlength
                ? msg(
                    str`Please shorten the description to ${formatNumber(this.maxlength)} or fewer characters.`,
                  )
                : "",
            );
          }
        },
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
