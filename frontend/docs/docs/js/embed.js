const url = new URL(window.location.href);

if (url.pathname.includes("/docs-embed") && window.self === window.top) {
  // Not within iframe, redirect to docs site instead
  window.location.assign(window.location.href.replace("/docs-embed", "/docs"));
} else {
  // Assume this is an iframe embedded in the Browsertrix app.
  window.document.documentElement.classList.add("btrix-app-embed");

  try {
    styleSearchComponent();
  } catch (err) {
    console.error(err);
  }
}

/**
 * HACK Zensical doesn't currently allow customizing the search component
 * (https://github.com/zensical/ui/tree/master/src/assets/javascripts/components/search)
 * so this script must be positioned after where the search UI is added.
 */
function styleSearchComponent() {
  const styles = `.l { border: 0; }
  .k { padding: 0.25rem 1rem 0.25rem 0.125rem; }`;

  const scripts = document.getElementsByTagName("script");
  let currEl = scripts[scripts.length - 1];

  while (currEl.previousElementSibling.tagName !== "DIV") {
    currEl = currEl.previousElementSibling;
  }

  const prevEl = currEl.previousElementSibling;

  if (prevEl.shadowRoot) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);

    prevEl.shadowRoot.adoptedStyleSheets = [
      ...prevEl.shadowRoot.adoptedStyleSheets,
      sheet,
    ];
  } else {
    console.debug("no previous element sibling with shadow root");
  }
}
