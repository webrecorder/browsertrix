/**
 * Shared lit css classes and utilities
 */
import { css } from "lit";

// From https://tailwindcss.com/docs/screen-readers#screen-reader-only-elements
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

// From https://tailwindcss.com/docs/text-overflow#truncate
export const truncate = css`
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
