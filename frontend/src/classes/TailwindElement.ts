import { LitElement } from "lit";

import themeCSS from "../theme.css";

// Create a new style sheet from the compiled theme CSS...
const theme = new CSSStyleSheet();
theme.replaceSync(themeCSS);

export function getThemeCSS() {
  return theme;
}

export class TailwindElement extends LitElement {
  connectedCallback(): void {
    super.connectedCallback();
    // ... and insert it into the shadow root!
    // This has the benefit of not requiring a whole copy of compiled Tailwind
    // for every TailwindElement, so we still get the benefits of atomic CSS.
    // And because Tailwind uses `@layer`[^1], the order of declarations ends up
    // correct, and you can use component styles with `static styles = ...`,
    // *and* you can use Tailwind functions and directives in those styles
    // thanks to `postcss-lit`.
    //
    // [^1]: (see https://tailwindcss.com/docs/adding-custom-styles#using-css-and-layer),
    this.shadowRoot?.adoptedStyleSheets.push(theme);
  }
}
