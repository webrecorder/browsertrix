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

    /* Custom font variables */
    --font-monostyle-family: var(--sl-font-mono);
    --font-monostyle-variation: "MONO" 0.51, "CASL" 0, "slnt" 0, "CRSV" 0;

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
    --sl-font-weight-medium: 500;
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

    /* From GitHub Primer https://github.com/primer/primitives/blob/8b767947e35a79db17b9d7970836f03c904c8afe/data/colors/vars/global_light.ts#L47 */
    /* TODO replace hardcoded color */
    --sl-input-required-content-color: #9a6700;

    /* Labels */
    --sl-input-label-font-size-small: var(--sl-font-size-x-small);
    --sl-input-label-font-size-medium: var(--sl-font-size-small);
    --sl-input-label-font-size-large: var(--sl-font-size-medium);
    --sl-input-label-color: var(--sl-color-neutral-800);

    /* Help text */
    --sl-input-help-text-font-size-medium: var(--sl-font-size-x-small);

    --sl-shadow-x-small: 0px 1px 2px rgba(0, 0, 0, 0.15);
  }

  body {
    font-size: var(--sl-font-size-medium);
  }

  .sl-toast-stack {
    bottom: 0;
    top: auto;
  }

  /* Add more spacing between label, input and help text */
  .form-label,
  btrix-tag-input::part(form-control-label),
  sl-input::part(form-control-label),
  sl-textarea::part(form-control-label),
  sl-select::part(form-control-label) {
    --sl-spacing-3x-small: 0.375rem;
    line-height: 1.4;
  }
  .form-label {
    display: inline-block;
    margin-bottom: var(--sl-spacing-3x-small);
  }
  .form-help-text,
  btrix-tag-input::part(form-control-help-text),
  sl-input::part(form-control-help-text),
  sl-textarea::part(form-control-help-text),
  sl-select::part(form-control-help-text) {
    margin-top: var(--sl-spacing-x-small);
    font-weight: 400;
    /* Enable controlling help text text alignment from parent */
    text-align: var(--help-text-align, left);
  }
  .form-help-text {
    color: var(--sl-input-help-text-color);
    font-size: var(--sl-input-help-text-font-size-medium);
  }

  /* Elevate select and buttons */
  sl-select::part(control),
  sl-button:not([variant="text"])::part(base) {
    box-shadow: var(--sl-shadow-small);
  }

  /* Prevent horizontal scrollbar */
  sl-select::part(menu) {
    overflow-x: hidden;
  }

  /* Decrease control spacing on small select */
  sl-select[size="small"]::part(control) {
    --sl-input-spacing-small: var(--sl-spacing-x-small);
    line-height: 1.5;
  }

  /* Align left edge with menu item */
  sl-select sl-menu-label::part(base) {
    padding-left: calc(var(--sl-spacing-2x-small) + 1.5em);
  }

  /* Add border to menu */
  sl-menu {
    border: 1px solid var(--sl-panel-border-color);
  }

  /* Validation styles */
  [data-user-invalid]:not([disabled])::part(base) {
    border-color: var(--sl-color-danger-400);
  }

  [data-user-invalid]:focus-within::part(base) {
    box-shadow: 0 0 0 var(--sl-focus-ring-width) var(--sl-color-danger-100);
  }

  [data-user-invalid]:not([disabled])::part(form-control-label):after {
    /* Required asterisk color */
    color: var(--sl-color-danger-500);
  }

  [data-user-invalid]:not([disabled])::part(form-control-help-text),
  [data-user-invalid]:not([disabled]) .form-help-text {
    color: var(--sl-color-danger-500);
  }

  /* TODO tailwind sets border-width: 0, see if this can be fixed in tw */
  sl-divider {
    border-top-width: var(--sl-panel-border-width);
  }

  /* Add more spacing between radio options */
  sl-radio-group sl-radio:first-of-type {
    margin-top: var(--sl-spacing-x-small);
  }
  sl-radio-group sl-radio:not(:first-of-type) {
    margin-top: var(--sl-spacing-small);
  }

  /* Have button group take up whole width */
  sl-radio-group::part(button-group),
  sl-radio-group sl-radio-button {
    width: 100%;
    min-width: min-content;
  }

  /* For single-input forms with submit button inline */
  /* Requires form control and button to be direct children */
  .inline-control-input,
  .inline-control-input::part(form-control) {
    display: contents;
  }

  .inline-control-form {
    display: grid;
    grid-template-areas:
      "label ."
      "input button"
      "help-text .";
    grid-template-columns: 1fr max-content;
    column-gap: var(--sl-spacing-small);
  }

  .inline-control-input::part(form-control-label) {
    grid-area: label;
  }

  .inline-control-input::part(form-control-input) {
    grid-area: input;
  }

  .inline-control-input::part(form-control-help-text) {
    grid-area: help-text;
  }

  .inline-control-button {
    grid-area: button;
  }

  /* Inputs with "Max N characters" help text */
  .with-max-help-text {
    --help-text-align: right;
  }

  /* Aesthetically closer to monospaced font: */
  .font-monostyle {
    font-family: var(--font-monostyle-family);
    font-variation-settings: var(--font-monostyle-variation);
  }

  .truncate {
    /* Fix tailwind clipping vertical */
    overflow: clip visible;
  }

  .offscreen {
    position: absolute;
    left: -9999px;
    bottom: -9999px;
    visibility: hidden;
    clip: rect(0 0 0 0);
  }
`;

export default theme;
