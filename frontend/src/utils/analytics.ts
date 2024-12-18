/**
 * Custom tracking for analytics.
 *
 * `window.analytics` should be made available through the `extra.js` injected by the server.
 */
declare global {
  // eslint-disable-next-line no-var
  var analytics: (
    event: string,
    opts: { props?: { [key: string]: unknown } },
  ) => {};
}

export enum TrackEvent {
  ViewPublicCollection = "View Public Collection",
  CopyPublicCollectionLink = "Copy Share Collection Link",
  DownloadPublicCollection = "Download Public Collection",
}

export function track(event: TrackEvent, props?: { [key: string]: unknown }) {
  if (!(window.analytics as unknown)) {
    return;
  }

  try {
    window.analytics(event, { props });
  } catch (err) {
    console.debug(err);
  }
}
