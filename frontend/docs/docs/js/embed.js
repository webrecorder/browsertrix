const url = new URL(window.location.href);

if (url.pathname.includes("/docs-embed/")) {
  if (window.self === window.top) {
    // Not within iframe, redirect to docs site instead
    window.location.assign(
      window.location.href.replace("/docs-embed/", "/docs/"),
    );
  } else {
    // Within iframe--assume this is an iframe embedded in the Browsertrix app.
    window.document.documentElement.classList.add("btrix-app-embed");
  }
}
