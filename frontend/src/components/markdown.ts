/**
 * ByteMD wrapper
 * https://github.com/bytedance/bytemd
 */
import { LitElement, html } from "lit";
import { state, property } from "lit/decorators.js";
import { Viewer } from "bytemd";

export class MarkdownViewer extends LitElement {
  // TODO style

  @property({ type: String })
  value = "";

  private viewer?: Viewer;

  protected firstUpdated(): void {
    this.viewer = new (Viewer as any)({
      target: this.shadowRoot!.querySelector("div"),
      props: {
        value: this.value,
      },
    });
  }

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (
      this.viewer &&
      changedProperties.has("value") &&
      this.value !== undefined
    ) {
      (this.viewer as any).$$set({ value: this.value });
    }
  }

  render() {
    return html`<div></div>`;
  }
}
