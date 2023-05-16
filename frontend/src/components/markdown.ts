/**
 * ByteMD wrapper
 * https://github.com/bytedance/bytemd
 */
import { LitElement, html, css } from "lit";
import { state, property } from "lit/decorators.js";
import { Viewer } from "bytemd";

export class MarkdownViewer extends LitElement {
  static styles = css`
    h1 {
      font-size: var(--sl-font-size-x-large);
    }

    h2 {
      font-size: var(--sl-font-size-large);
    }

    h3 {
      font-size: var(--sl-font-size-medium);
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      font-weight: var(--sl-font-weight-semibold);
      margin-top: 0;
    }

    a {
      color: var(--primary);
    }

    a:hover {
      text-decoration: none;
    }
  `;

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
