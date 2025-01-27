import { msg } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";
import { html } from "lit";

import {
  validateCaptionMax,
  validateNameMax,
  type CollectionEdit,
} from "../collection-edit-dialog";

export default function renderAbout(this: CollectionEdit) {
  if (!this.collection) return;
  return html`<sl-input
      class="with-max-help-text part-[input]:text-base part-[input]:font-semibold"
      name="name"
      label=${msg("Name")}
      value=${this.collection.name}
      placeholder=${msg("My Collection")}
      autocomplete="off"
      required
      help-text=${validateNameMax.helpText}
      @sl-input=${(e: CustomEvent) => {
        this.validate(validateNameMax)(e);
        this.name = (e.target as SlInput).value;
      }}
    >
    </sl-input>
    <sl-textarea
      class="with-max-help-text"
      name="caption"
      value=${this.collection.caption ?? ""}
      placeholder=${msg("Summarize the collection's content")}
      autocomplete="off"
      rows="2"
      help-text=${validateCaptionMax.helpText}
      @sl-input=${this.validate(validateCaptionMax)}
    >
      <span slot="label">
        ${msg("Summary")}
        <sl-tooltip>
          <span slot="content">
            ${msg(
              "Write a short description that summarizes this collection. If the collection is public, this description will be visible next to the collection name.",
            )}
          </span>
          <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
        </sl-tooltip>
      </span>
    </sl-textarea>
    <btrix-markdown-editor
      class="flex-1"
      .initialValue=${this.collection.description ?? ""}
      placeholder=${msg("Tell viewers about this collection")}
      maxlength=${4000}
      label=${msg("Description")}
    ></btrix-markdown-editor>`;
}
