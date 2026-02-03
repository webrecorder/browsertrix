import { customElement, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import RegexColorize from "regex-colorize";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * Syntax-highlighted regular expression pattern
 */
@customElement("btrix-regex")
export class Component extends TailwindElement {
  @property({ type: String })
  value = "";

  render() {
    if (!this.value) return;

    return staticHtml`<span class="regex ${tw`font-mono`}">${unsafeStatic(
      new RegexColorize().colorizeText(this.value) as string,
    )}</span>`;
  }
}
