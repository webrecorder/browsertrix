/**
 * Shared lit css classes and utilities
 */
import { css } from "lit";

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

// From https://tailwindcss.com/docs/text-overflow#truncate
export const truncate = css`
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
