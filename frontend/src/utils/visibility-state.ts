const SUPPORTS_VISIBILITY_STATE_ENTRY = "VisibilityStateEntry" in window;

/**
 * Detect initial visibility state based on performance API, with fallback for unsupported browsers.
 *
 * Based on https://github.com/GoogleChrome/modern-web-guidance/blob/684ab9d7c6b78fc2cd5677912d874397cb2e5dfa/skills/modern-web-guidance/guides/performance/detect-initial-visibility-state.md
 */
function getInitialVisibilityState() {
  /**
   * Accurately determines visibility state history using the Performance API.
   * Not supported in all browsers yet, see: https://caniuse.com/?search=VisibilityStateEntry
   */
  function getVisibilityState() {
    const entries = performance.getEntriesByType("visibility-state");

    if (entries.length > 0) {
      const firstEntry = entries[0];
      const initiallyBackgrounded = firstEntry.name === "hidden";

      return { hidden: initiallyBackgrounded } as const;
    }

    return { hidden: undefined } as const;
  }

  /**
   * Fallback implementation using document.visibilityState.
   * This approach is prone to race conditions if the script loads asynchronously.
   */
  function getFallbackVisibilityState() {
    // Check the state exactly when this script executes.
    // This will fail to detect an initial background state if the user
    // foregrounded the page before this script executed.
    const initiallyBackgrounded = document.visibilityState === "hidden";

    return { hidden: initiallyBackgrounded } as const;
  }

  if (SUPPORTS_VISIBILITY_STATE_ENTRY) {
    return getVisibilityState();
  }

  return getFallbackVisibilityState();
}

export const initialVisibilityState = getInitialVisibilityState();
