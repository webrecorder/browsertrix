import { createContext } from "@lit/context";

/**
 * Boundary for custom <sl-popup> instances to use, e.g. when inside a dialog
 */
export const popupBoundary = createContext<Element | Element[] | undefined>(
  "popup-boundary",
);
