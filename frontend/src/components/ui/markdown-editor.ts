import { localized, msg, str } from "@lit/localize";
import { wrap, type AwaitableInstance } from "ink-mde";
import { css, html, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
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
@localized()
@customElement("btrix-markdown-editor")
export class MarkdownEditor extends BtrixElement {
  static styles = css`
    :host {
      --ink-border-radius: var(--sl-input-border-radius-medium);
      --ink-color: var(--sl-input-color);
      --ink-block-background-color: var(--sl-color-neutral-50);
      --ink-block-padding: var(--sl-input-spacing-small);
    }

    .ink-mde-textarea {
      flex-grow: 1;
    }

    .ink-mde {
      height: 100%;
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

    .cm-line:only-child {
      height: 100%;
      min-height: 20em;
    }
  `;

  @property({ type: String })
  label = "";

  @property({ type: String })
  placeholder = "";

  @property({ type: String })
  initialValue = "";

  @property({ type: String })
  value = "";

  @property({ type: Number })
  maxlength?: number;

  @query("#editor-textarea")
  private readonly textarea?: HTMLTextAreaElement | null;

  private editor?: AwaitableInstance;

  public checkValidity() {
    return this.textarea?.checkValidity();
  }

  public async focus() {
    await this.updateComplete;
    (await this.editor)?.focus();
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (
      changedProperties.has("initialValue") &&
      this.initialValue &&
      !this.value
    ) {
      this.value = this.initialValue;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.editor?.destroy();
  }

  protected firstUpdated(): void {
    this.initEditor();
  }

  render() {
    const isInvalid = this.maxlength && this.value.length > this.maxlength;
    return html`
      <fieldset
        ?data-invalid=${isInvalid}
        ?data-user-invalid=${isInvalid}
        class="flex h-full flex-col"
      >
        ${this.label && html`<label class="form-label">${this.label}</label>`}
        <textarea id="editor-textarea"></textarea>
        <div class="helpText flex items-baseline justify-between">
          <p class="text-xs">
            ${msg(
              html`Supports
                <a
                  class="text-blue-500 hover:text-blue-600"
                  href="https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  >GitHub Flavored Markdown</a
                >.`,
            )}
          </p>

          ${this.maxlength
            ? html`<div>
                <p class="form-help-text">
                  ${getHelpText(this.maxlength, this.value.length)}
                </p>
              </div>`
            : ""}
        </div>
      </fieldset>
    `;
  }

  private initEditor() {
    if (!this.textarea) return;

    if (this.editor) {
      this.editor.destroy();
    }

    this.editor = wrap(this.textarea, {
      doc: this.initialValue,
      hooks: {
        beforeUpdate: (doc: string) => {
          if (this.maxlength) {
            this.textarea?.setCustomValidity(
              doc.length > this.maxlength
                ? msg(
                    str`Please shorten the description to ${this.localize.number(this.maxlength)} or fewer characters.`,
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
      placeholder: this.placeholder,
    });
  }
}
