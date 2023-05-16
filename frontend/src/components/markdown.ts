/**
 * Parse markdown
 * TODO editor
 */
import { LitElement, html, css } from "lit";
import { state, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { micromark } from "micromark";

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

    img {
      max-width: 100%;
    }
  `;

  @property({ type: String })
  value = "";

  render() {
    return staticHtml`<div>${unsafeStatic(micromark(this.value || ""))}</div>`;
  }
}
