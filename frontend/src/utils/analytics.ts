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

export function track(event: string, props?: { [key: string]: unknown }) {
  if (!(window.analytics as unknown)) {
    return;
  }

  window.analytics(event, { props });
}
