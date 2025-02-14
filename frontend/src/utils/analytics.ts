/**
 * Custom tracking for analytics.
 *
 * Any third-party analytics script will need to have been made
 * available through the `extra.js` injected by the server.
 */

import { AnalyticsTrackEvent } from "../trackEvents";

export type AnalyticsTrackProps = {
  org_slug?: string | null;
  logged_in?: boolean;
  collection_slug?: string;
  section?: string;
};

declare global {
  interface Window {
    btrixEvent?: (
      event: string,
      extra?: { props?: AnalyticsTrackProps },
    ) => void;
  }
}

export function track(
  event: `${AnalyticsTrackEvent}`,
  props?: AnalyticsTrackProps,
) {
  if (!window.btrixEvent) {
    return;
  }

  try {
    window.btrixEvent(event, { props });
    console.debug("btrixEvent tracked:", event, props);
  } catch (err) {
    console.debug(err);
  }
}

export function pageView(props?: AnalyticsTrackProps) {
  track(AnalyticsTrackEvent.PageView, props);
}
