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

export enum TrackEvent {
  ViewPublicCollection = "View Public Collection",
  CopyPublicCollectionLink = "Copy Share Collection Link",
  DownloadPublicCollection = "Download Public Collection",
}

export function track(event: TrackEvent, props?: { [key: string]: unknown }) {
  if (!analytics) {
    return;
  }

  try {
    analytics(event, { props });
  } catch (err) {
    console.debug(err);
  }
}
