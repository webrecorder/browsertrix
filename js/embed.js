if (window.self !== window.top) {
  // Within iframe--assume this is an iframe embedded in the Browsertrix app.
  const style = document.createElement("style");

  // Decrease text size without decreasing element size and overall spacing
  style.innerText = `.md-typeset { font-size: 0.7rem; }`;

  window.document.body.appendChild(style);
}
