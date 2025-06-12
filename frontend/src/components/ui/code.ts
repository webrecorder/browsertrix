import clsx from "clsx";
import type { LanguageFn } from "highlight.js";
import hljs from "highlight.js/lib/core";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

export enum Language {
  Javascript = "javascript",
  XML = "xml",
  CSS = "css",
}

const langaugeFiles: Record<Language, Promise<{ default: LanguageFn }>> = {
  [Language.Javascript]: import(
    /* webpackChunkName: "highlight.js" */ "highlight.js/lib/languages/javascript"
  ),
  [Language.XML]: import(
    /* webpackChunkName: "highlight.js" */ "highlight.js/lib/languages/xml"
  ),
  [Language.CSS]: import(
    /* webpackChunkName: "highlight.js" */ "highlight.js/lib/languages/css"
  ),
};

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
  language = Language.XML;

  @property({ type: Boolean })
  wrap = true;

  async connectedCallback() {
    const languageFn = (await langaugeFiles[this.language]).default;

    const registeredLanguages = hljs.listLanguages();

    if (!registeredLanguages.includes(this.language)) {
      hljs.registerLanguage(this.language, languageFn);
    }

    super.connectedCallback();
  }

  render() {
    const htmlStr = hljs.highlight(this.value, {
      language: this.language,
    }).value;

    return html`<pre
      part="base"
      class=${clsx(
        tw`font-monospace m-0 text-neutral-600`,
        this.wrap ? tw`whitespace-pre-wrap` : tw`whitespace-nowrap`,
      )}
    ><code>${staticHtml`${unsafeStatic(htmlStr)}`}</code></pre>`;
  }
}
