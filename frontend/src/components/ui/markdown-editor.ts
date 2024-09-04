import { msg, str } from "@lit/localize";
import clsx from "clsx";
import { wrap, type AwaitableInstance } from "ink-mde";
import { css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
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

    .previewMode .ink-mde-textarea,
    .previewMode .helpText {
      display: none;
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
  label = "";

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

  @state()
  private preview = false;

  private editor?: AwaitableInstance;

  public checkValidity() {
    return this.textarea?.checkValidity();
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

  render() {
    const isInvalid = this.maxlength && this.value.length > this.maxlength;
    return html`
      <fieldset
        class=${clsx(this.preview ? "previewMode" : "")}
        ?data-invalid=${isInvalid}
        ?data-user-invalid=${isInvalid}
      >
        <div class="mb-2 flex items-end justify-between">
          <label class="form-label mb-0">${this.label}</label>
          <sl-switch
            size="small"
            ?checked=${this.preview}
            @sl-change=${() => (this.preview = !this.preview)}
          >
            <span class="text-neutral-600">${msg("Preview")}</span>
          </sl-switch>
        </div>
        ${this.preview
          ? html`<div class="min-h-36 rounded border px-4">
              <btrix-markdown-viewer
                .value=${this.value}
              ></btrix-markdown-viewer>
            </div>`
          : nothing}
        <textarea
          name=${this.name}
          ${ref(this.initEditor as () => void)}
        ></textarea>
        <div class="helpText flex items-baseline justify-between">
          <p class="text-xs">
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
