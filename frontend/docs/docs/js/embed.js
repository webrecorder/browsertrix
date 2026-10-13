if (window.self === window.top) {
  // Within iframe--assume this is an iframe embedded in the Browsertrix app.
  window.document.documentElement.classList.add("btrix-app-embed");
}
