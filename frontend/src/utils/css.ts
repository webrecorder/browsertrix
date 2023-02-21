/**
 * Shared lit css classes and utilities
 */
import { css } from "lit";

// From tailwindcss
// https://tailwindcss.com/docs/screen-readers#screen-reader-only-elements
export const srOnly = css`
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
`;
