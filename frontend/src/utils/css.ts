/**
 * Shared lit css classes and utilities
 */
import { css } from "lit";

// Base typography styles, from Figma Webrecorder Primitives
export const typography = css`
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-weight: var(--sl-font-weight-semibold);
    line-height: 150%;
    margin-top: var(--sl-spacing-medium);
    margin-bottom: var(--sl-spacing-medium);
  }

  h1:first-child,
  h2:first-child,
  h3:first-child,
  h4:first-child,
  h5:first-child,
  h6:first-child {
    margin-top: 0;
  }

  h2 {
    font-size: var(--sl-font-size-x-large);
  }

  h3 {
    font-size: var(--sl-font-size-large);
  }

  h4 {
    font-size: 1rem;
  }

  h5 {
    font-size: var(--sl-font-size-small);
  }

  h6 {
    font-size: var(--sl-font-size-x-small);
  }

  p {
    font-size: var(--sl-font-size-medium);
    line-height: 143%;
  }

  strong,
  b {
    font-weight: var(--sl-font-weight-semibold);
  }
`;

// From https://tailwindcss.com/docs/screen-readers#screen-reader-only-elements
export const srOnly = css`
  .srOnly {
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

export const truncate = css`
  .truncate {
    overflow: clip visible;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* Fix for if flex item: */
    min-width: 0;
  }
`;

// From https://tailwindcss.com/docs/animation#pulse
export const animatePulse = css`
  .animatePulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
`;

export const dropdown = css`
  .dropdown {
    contain: content;
    transform-origin: top left;
    box-shadow: var(--sl-shadow-medium);
  }

  .hidden {
    display: none;
  }

  .animateShow {
    animation: dropdownShow 100ms ease forwards;
  }

  .animateHide {
    animation: dropdownHide 100ms ease forwards;
  }

  @keyframes dropdownShow {
    from {
      opacity: 0;
      transform: scale(0.9);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes dropdownHide {
    from {
      opacity: 1;
      transform: scale(1);
    }

    to {
      opacity: 0;
      transform: scale(0.9);
    }
  }
`;
