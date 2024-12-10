// Inject analytics script into the page
// Only used if env var ANALYTICS is enabled
// Hand-minified version of this is used in 00-browsertrix-nginx-init.sh
const plausible = document.createElement("script");
plausible.src =
  "$SRC/js/script.file-downloads.hash.pageview-props.tagged-events.js";
plausible.defer = true;
plausible.dataset.domain = "browsertrix.com";
document.head.appendChild(plausible);

const plausibleFallback = document.createElement("script");
plausibleFallback.textContent =
  "window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)};";
document.head.appendChild(plausibleFallback);
