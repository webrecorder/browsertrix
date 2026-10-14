/**
 * Navigates embedded docs without reloading the iframe.
 * Based on https://github.com/zensical/ui/blob/87eaf380f83c2dd581e23ed15a5eca5020a37e49/src/assets/javascripts/browser/location/_/index.ts
 */
export function navigateEmbeddedDocs(iframe: HTMLIFrameElement, docsPath = "") {
  const link = iframe.contentDocument?.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  const baseUrl = link?.href.split("/docs-embed")[0] ?? window.location.origin;
  const url = new URL(`${baseUrl}${docsPath}`);
  // The URL format must match the format of URLs found in the docs site's sitemap.xml,
  // which have a trailing slash.
  const href = `${url.origin}${url.pathname.replace(/\/$/, "")}/${url.search}${url.hash}`;

  try {
    if (!iframe.contentDocument)
      throw "no embedded docs iframe `contentDocument`, cannot instant navigate";

    const el = iframe.contentDocument.createElement("a");
    el.setAttribute("href", href);
    iframe.contentDocument.body.appendChild(el);
    el.click();
    el.remove();
  } catch (err) {
    console.debug(err);

    iframe.src = docsPath;
  }
}

/**
 * Open search modal in embedded docs.
 */
export function searchEmbeddedDocs(iframe: HTMLIFrameElement) {
  if (!iframe.contentDocument) {
    console.debug(
      "no embedded docs iframe `contentDocument`, cannot search modal",
    );

    return;
  }

  if (!getEmbeddedDocsSearchBackdrop(iframe)) {
    iframe.contentDocument
      .querySelector<HTMLButtonElement>(".md-search__button")
      ?.click();
  }
}

/**
 * Find search modal in embedded docs and check if search modal is open.
 * ID is added by `docs/js/search.js`.
 * Unfortunately the "v" class seems to be only way to detect whether the modal is open.
 */
export function getEmbeddedDocsSearchBackdrop(iframe: HTMLIFrameElement) {
  const searchModal =
    iframe.contentDocument?.getElementById("search-component");
  const backdrop = searchModal?.shadowRoot?.children[0]?.children[0];

  if (backdrop && !backdrop.classList.contains("v")) {
    return backdrop as HTMLElement;
  }
}
