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
    :host {
      --ink-border-radius: var(--sl-input-border-radius-medium);
      --ink-color: var(--sl-input-color);
      --ink-block-background-color: var(--sl-color-neutral-50);
      --ink-block-padding: var(--sl-input-spacing-small);
    }

    .ink-mde {
      border: solid var(--sl-input-border-width) var(--sl-input-border-color);
    }

    .ink-mde-toolbar {
      border-top-left-radius: var(--ink-border-radius);
      border-top-right-radius: var(--ink-border-radius);
      border-bottom: 1px solid var(--sl-panel-border-color);
    }

    .ink-mde .ink-mde-toolbar .ink-button {
      width: 2rem;
      height: 2rem;
    }

    .ink-mde .ink-mde-editor {
      padding: var(--sl-input-spacing-medium);
      min-height: 8rem;
    }

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
      <fieldset ?data-invalid=${isInvalid} ?data-user-invalid=${isInvalid}>
        <textarea
          name=${this.name}
          ${ref(this.initEditor as () => void)}
        ></textarea>
        <div class="form-help-text flex justify-between">
          <p>
            ${msg(
              html`Supports
                <a
                  class="text-blue-500 hover:text-blue-600"
                  href="https://github.github.com/gfm/#what-is-markdown-"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  >GitHub Flavored Markdown</a
                >.`,
            )}
          </p>

          ${this.maxlength
            ? html`<div>${getHelpText(this.maxlength, this.value.length)}</div>`
            : ""}
        </div>
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
