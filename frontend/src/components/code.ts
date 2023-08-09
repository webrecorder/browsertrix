import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";

/**
 * Syntax highlighting for javascript and HTML (XML)
 */
export class Code extends LitElement {
  static styles = [
    css`
      pre {
        white-space: pre-wrap;
        font-family: var(--sl-font-mono);
        font-size: 0.9em;
        color: #24292e;
        margin: 0;
      }

      .hljs-name {
        color: #22863a;
      }

      .hljs-attr {
        color: #6f42c1;
      }

      .hljs-string {
        color: #032f62;
      }
    `,
  ];

  @property({ type: String })
  value: string = "";

  @property({ type: String })
  language: "javascript" | "xml" = "xml";

  constructor() {
    super();
    hljs.registerLanguage("javascript", javascript);
    hljs.registerLanguage("xml", xml);
  }

  render() {
    const htmlStr = hljs.highlight(this.value, {
      language: this.language,
    }).value;
    return html`<pre><code>${staticHtml`${unsafeStatic(
      htmlStr
    )}`}</code></pre>`;
  }
}
