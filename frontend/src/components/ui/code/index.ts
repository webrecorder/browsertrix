import clsx from "clsx";
import type { LanguageFn } from "highlight.js";
import hljs from "highlight.js/lib/core";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

export enum Language {
  Javascript = "javascript",
  XML = "xml",
  CSS = "css",
  URL = "url",
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
  [Language.URL]: import(
    /* webpackChunkName: "highlight.js" */ "./languages/url"
  ),
};

/**
 * Syntax highlighting for javascript, HTML (XML), CSS, and URLs
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

    .hljs-protocol {
      color: var(--sl-color-neutral-400);
    }

    .hljs-path {
      color: var(--sl-color-sky-600);
    }

    .hljs-domain {
      color: var(--sl-color-sky-700);
    }

    .hljs-string {
      color: #032f62;
    }
  `;

  @property({ type: String })
  value = "";

  @property({ type: String })
  language: Language = Language.XML;

  @property({ type: Boolean })
  noWrap = false;

  @property({ type: Boolean })
  truncate = false;

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
        this.noWrap ? tw`whitespace-nowrap` : tw`whitespace-pre-wrap`,
        this.truncate && tw`truncate`,
      )}
    ><code title=${ifDefined(
      this.truncate ? this.value : undefined,
    )}>${staticHtml`${unsafeStatic(htmlStr)}`}</code></pre>`;
  }
}
