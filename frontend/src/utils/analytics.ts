/**
 * Custom tracking for analytics.
 *
 * Any third-party analytics script will need to have been made
 * available through the `extra.js` injected by the server.
 */

import { AnalyticsTrackEvent } from "../trackEvents";

import router from "./router";
import appState from "./state";

export type AnalyticsTrackProps = {
  org_slug: string | null;
  collection_slug?: string | null;
  logged_in?: boolean;
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

  const defaultProps: AnalyticsTrackProps = {
    org_slug:
      props?.org_slug ??
      router.match(`${window.location.pathname}${window.location.search}`)
        .params.slug ??
      null,
    logged_in: !!appState.auth,
  };

  try {
    window.btrixEvent(event, {
      props: {
        ...defaultProps,
        ...props,
      },
    });
  } catch (err) {
    console.debug(err);
  }
}

export function pageView(props?: AnalyticsTrackProps) {
  track(AnalyticsTrackEvent.PageView, props);
}
