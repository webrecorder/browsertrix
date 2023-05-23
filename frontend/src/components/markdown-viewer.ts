import { LitElement, html, css } from "lit";
import { state, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { micromark } from "micromark";

/**
 * View rendered markdown
 */
export class MarkdownViewer extends LitElement {
  // TODO
  // static styles = css``

  @property({ type: String })
  value = "";

  render() {
    return staticHtml`${unsafeStatic(micromark(this.value))}`;
  }
}
