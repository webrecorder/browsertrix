import type { CSSResultGroup } from "lit";
import { LitElement, unsafeCSS } from "lit";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const themeCSS = require("!!raw-loader!postcss-loader!../theme.css").default;

export class TailwindElement extends LitElement {
  /**
   * Setting this will remove Tailwind from this component, unless you include the `@tailwind` directives at the start of your css.
   */
  static styles: CSSResultGroup = unsafeCSS(themeCSS);
}
