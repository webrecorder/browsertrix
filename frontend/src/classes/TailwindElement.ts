import type { CSSResultGroup } from "lit";
import { LitElement } from "lit";
import { css } from "lit";

export class TailwindElement extends LitElement {
  /**
   * Setting this will remove Tailwind from this component, unless you include the `@tailwind` directives at the start of your css.
   */
  static styles: CSSResultGroup = css`
    @tailwind base;
    @tailwind components;
    @tailwind utilities;
  `;
}
