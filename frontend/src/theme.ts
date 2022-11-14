/**
 * Shoelace CSS theming variables and component overrides
 * https://github.com/shoelace-style/shoelace/blob/next/src/themes/light.css
 *
 * To make new variables available to Tailwind, update
 * `theme` in tailwind.cofnig.js
 */
import { css, unsafeCSS } from "lit";
import Color from "color";

// TODO generate at build time
const PRIMARY_COLOR = "#4876ff";
const primaryColor = Color(PRIMARY_COLOR);

const theme = css`
  :root {
    /* Custom contextual variables */
    --primary: ${unsafeCSS(PRIMARY_COLOR)};
    --success: var(--sl-color-success-600);
    --warning: var(--sl-color-warning-600);
    --danger: var(--sl-color-danger-600);

    /*
     * Shoelace Theme Tokens
     */
    /* Primary */
    --sl-color-primary-50: ${unsafeCSS(primaryColor.lighten(0.54))};
    --sl-color-primary-100: ${unsafeCSS(primaryColor.lighten(0.5))};
    --sl-color-primary-200: ${unsafeCSS(primaryColor.lighten(0.4))};
    --sl-color-primary-300: ${unsafeCSS(primaryColor.lighten(0.3))};
    --sl-color-primary-400: ${unsafeCSS(primaryColor.lighten(0.2))};
    --sl-color-primary-500: ${unsafeCSS(primaryColor.lighten(0.1))};
    --sl-color-primary-600: var(--primary);
    --sl-color-primary-700: ${unsafeCSS(primaryColor.darken(0.1))};
    --sl-color-primary-800: ${unsafeCSS(primaryColor.darken(0.2))};
    --sl-color-primary-900: ${unsafeCSS(primaryColor.darken(0.3))};
    --sl-color-primary-950: ${unsafeCSS(primaryColor.darken(0.4))};

    /*
     * Typography
     */

    /* Fonts */
    --sl-font-mono: "Recursive var", SFMono-Regular, Consolas, "Liberation Mono",
      Menlo, monospace;
    --sl-font-sans: "Inter var", -apple-system, BlinkMacSystemFont, "Segoe UI",
      Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji",
      "Segoe UI Emoji", "Segoe UI Symbol";

    /* Font sizes */
    --sl-font-size-medium: 0.875rem; /* 14px */
    --sl-font-size-2x-large: 2rem; /* 32px */

    /* Font weights */
    --sl-font-weight-medium: 500; // doesn't exist in shoelace
    --sl-font-weight-semibold: 600;

    /*
     * Forms
     */

    /* Buttons */
    --sl-button-font-size-small: var(--sl-font-size-small);
    --sl-button-font-size-medium: var(--sl-font-size-small);
    --sl-button-font-size-large: var(--sl-font-size-medium);

    /* Inputs */
    --sl-input-height-small: 2rem; /* 32px */

    --sl-input-font-size-small: var(--sl-font-size-small);
    --sl-input-font-size-medium: var(--sl-font-size-small);
    --sl-input-font-size-large: var(--sl-font-size-medium);

    /* Labels */
    --sl-input-label-font-size-small: var(--sl-font-size-x-small);
    --sl-input-label-font-size-medium: var(--sl-font-size-small);
    --sl-input-label-font-size-large: var(--sl-font-size-medium);
    --sl-input-label-color: var(--sl-color-neutral-800);
  }

  .sl-toast-stack {
    bottom: 0;
    top: auto;
  }

  /* Elevate select and buttons */
  sl-select::part(control),
  sl-button::part(base) {
    box-shadow: var(--sl-shadow-small);
  }

  /* Decrease control spacing on small select */
  sl-select[size="small"]::part(control) {
    --sl-input-spacing-small: var(--sl-spacing-x-small);
    line-height: 1.5;
  }

  /* Validation styles */
  sl-input.invalid:not([disabled])::part(base) {
    border-color: var(--sl-color-danger-400);
  }

  sl-input.invalid:focus-within::part(base) {
    box-shadow: 0 0 0 var(--sl-focus-ring-width) var(--sl-color-danger-100);
  }
`;

export default theme;
