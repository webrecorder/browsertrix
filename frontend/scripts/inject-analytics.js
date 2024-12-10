// Inject analytics scripts into the page
// This is not used by default; see https://docs.browsertrix.com/deploy/customization/#analytics for more information.
const plausible = document.createElement("script");
plausible.src =
  "https://p.webrecorder.net/js/script.file-downloads.hash.pageview-props.tagged-events.js";
plausible.defer = true;
plausible.dataset.domain = "browsertrix.com";
document.head.appendChild(plausible);

const plausibleFallback = document.createElement("script");
plausibleFallback.textContent =
  "window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)};";
document.head.appendChild(plausibleFallback);
