/**
 * Custom tracking for analytics.
 *
 * Any third-party analytics script will need to have been made
 * available through the `extra.js` injected by the server.
 */

// type Track = (
//   event: string,
//   opts: { props?: { [key: string]: unknown } },
// ) => {};

// ANALYTICS_NAMESPACE is specified with webpack `DefinePlugin`
const analytics = window.process.env.ANALYTICS_NAMESPACE
  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[window.process.env.ANALYTICS_NAMESPACE]
  : null;

console.log("analytics:", analytics);

export enum AnalyticsTrackEvent {
  PageView = "pageview",
  CopyPublicCollectionLink = "[Collections] Copy share collection link",
  DownloadPublicCollection = "[Collections] Download public collection",
}

type AnalyticsTrackProps = { [key: string]: unknown };

export function track(
  event: `${AnalyticsTrackEvent}`,
  props?: AnalyticsTrackProps,
) {
  if (!analytics) {
    return;
  }

  try {
    console.log("event:", event);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)["plausible"](event, { props });
  } catch (err) {
    console.debug(err);
  }
}

export function pageView(props?: AnalyticsTrackProps) {
  track(AnalyticsTrackEvent.PageView, props);
}
