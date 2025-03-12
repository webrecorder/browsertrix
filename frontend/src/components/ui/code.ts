import hljs from "highlight.js/lib/core";
import hljsCss from "highlight.js/lib/languages/css";
import hljsJavascript from "highlight.js/lib/languages/javascript";
import hljsXml from "highlight.js/lib/languages/xml";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * Syntax highlighting for javascript, HTML (XML), and CSS
 */
@customElement("btrix-code")
export class Code extends TailwindElement {
  static styles = css`
    .hljs-name,
    .hljs-selector-tag {
      color: var(--sl-color-lime-600);
    }

    .hljs-attr,
    .hljs-selector-attr,
    .hljs-selector-class {
      color: var(--sl-color-violet-500);
    }

    .hljs-string {
      color: #032f62;
    }
  `;

  @property({ type: String })
  value = "";

  @property({ type: String })
  language: "javascript" | "xml" | "css" = "xml";

  constructor() {
    super();
    hljs.registerLanguage("css", hljsCss);
    hljs.registerLanguage("javascript", hljsJavascript);
    hljs.registerLanguage("xml", hljsXml);
  }

  render() {
    const htmlStr = hljs.highlight(this.value, {
      language: this.language,
    }).value;

    return html`<pre
      class="font-monospace m-0 whitespace-pre-wrap text-neutral-600"
    ><code>${staticHtml`${unsafeStatic(htmlStr)}`}</code></pre>`;
  }
}
