import { LitElement } from "lit";

// Load the contents of `theme.css`, processed with postcss (tailwind), as a
// string using Webpack's raw-loader.
// TODO(emma, 2023-12-12) Figure out how this'll need to change with Webpack 5,
// as it removes raw-loader
// eslint-disable-next-line @typescript-eslint/no-var-requires
const themeCSS = require("!!raw-loader!postcss-loader!../theme.css").default;

// Create a new style sheet from the compiled theme CSS...
const theme = new CSSStyleSheet();
theme.replaceSync(themeCSS);

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
