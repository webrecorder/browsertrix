import { unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import RegexColorize from "regex-colorize";

import stylesheet from "./regex.stylesheet.css";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

const styles = unsafeCSS(stylesheet);

/**
 * Syntax-highlighted regular expression pattern
 */
@customElement("btrix-regex")
export class Component extends TailwindElement {
  static styles = styles;

  @property({ type: String })
  value = "";

  render() {
    if (!this.value) return;

    return staticHtml`<span class="regex ${tw`font-mono leading-none text-neutral-600`}">${unsafeStatic(
      new RegexColorize().colorizeText(this.value) as string,
    )}</span>`;
  }
}
