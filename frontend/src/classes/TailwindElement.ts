import type { CSSResultGroup } from "lit";
import { LitElement } from "lit";
import { css } from "lit";

export class TailwindElement extends LitElement {
  /**
   * Additional styles to be added.
   *
   * Styles here get added in {@linkcode TailwindElement}'s `styles` after the `@tailwind` directives.
   */
  static additionalStyles?: CSSResultGroup;

  /**
   * Use {@linkcode additionalStyles} instead.
   *
   * Setting this will remove Tailwind from this component, unless you include the `@tailwind` directives at the start of your css.
   *
   * @deprecated
   */
  static styles = [
    css`
      @tailwind base;
      @tailwind components;
      @tailwind utilities;
    `,
    TailwindElement.additionalStyles ?? [],
  ];
}
