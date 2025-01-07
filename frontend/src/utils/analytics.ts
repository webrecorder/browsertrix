/**
 * Custom tracking for analytics.
 *
 * Any third-party analytics script will need to have been made
 * available through the `extra.js` injected by the server.
 */

import { AnalyticsTrackEvent } from "../trackEvents";

type AnalyticsTrackProps = { [key: string]: unknown };

export function track(
  event: `${AnalyticsTrackEvent}`,
  props?: AnalyticsTrackProps,
) {
  // ANALYTICS_NAMESPACE is specified with webpack `DefinePlugin`
  const analytics = window.process.env.ANALYTICS_NAMESPACE
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)[window.process.env.ANALYTICS_NAMESPACE]
    : null;

  if (!analytics) {
    return;
  }

  try {
    analytics(event, { props });
  } catch (err) {
    console.debug(err);
  }
}

export function pageView(props?: AnalyticsTrackProps) {
  track(AnalyticsTrackEvent.PageView, props);
}
