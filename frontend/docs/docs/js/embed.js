setupEmbed();

function setupEmbed() {
  const url = new URL(window.location.href);

  if (url.pathname.includes("/docs-embed") && window.self === window.top) {
    // Not within iframe, redirect to docs site instead
    window.location.assign(
      window.location.href.replace("/docs-embed", "/docs"),
    );
  } else {
    // Assume this is an iframe embedded in the Browsertrix app.
    window.document.documentElement.classList.add("btrix-app-embed");

    try {
      styleSearchComponent();
    } catch (err) {
      console.error(err);
    }
  }
}

function styleSearchComponent() {
  // ID added by search.js
  const el = document.getElementById("search-component");

  if (!el) {
    console.debug("no element with ID `search-component`, cannot apply styles");
    return;
  }

  const styles = `.e { border: 0; }
  .w { padding: 0.25rem 0.25rem 0.25rem 0.125rem; }`;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);

  el.shadowRoot.adoptedStyleSheets = [
    ...el.shadowRoot.adoptedStyleSheets,
    sheet,
  ];
}
