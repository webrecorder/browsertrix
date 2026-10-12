if (window.self !== window.top) {
  // Within iframe--assume this is an iframe embedded in the Browsertrix app.
  window.document.documentElement.classList.add("btrix-app-embed");

  replaceDocsTitle();

  // TODO Detect Browsertrix color scheme
  setColorScheme("webrecorder-light");

  try {
    styleSearchComponent();
  } catch (err) {
    console.error(err);
  }
}

/**
 * Replace the "Browsertrix Docs" title with the title of the current page,
 * since the embed is already labeled by the Browsertrix panel as "User Guide".
 */
function replaceDocsTitle() {
  const docsTitle = document.querySelector(
    ".md-header__title .md-header__topic:first-child .md-ellipsis",
  );
  const pageTitle = document.querySelector(
    ".md-header__title .md-header__topic:last-child .md-ellipsis",
  );

  if (!docsTitle) {
    console.debug(
      "no docsTitle `.md-header__title md-header__topic:first-child .md-ellipsis`",
    );
    return;
  }

  if (!pageTitle) {
    console.debug(
      "no pageTitle `.md-header__title md-header__topic:last-child .md-ellipsis`",
    );
    return;
  }

  if (pageTitle.textContent) {
    docsTitle.textContent = pageTitle.textContent.trim();
  }
}

/**
 * Override theme preference to match Browsertrix
 */
function setColorScheme(scheme) {
  window.document.body.setAttribute("data-md-color-scheme", scheme);
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
  const thisScript = scripts[scripts.length - 1];
  const prevEl = thisScript.previousElementSibling;

  if (prevEl.tagName === "DIV" && prevEl.shadowRoot) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);

    prevEl.shadowRoot.adoptedStyleSheets = [
      ...prevEl.shadowRoot.adoptedStyleSheets,
      sheet,
    ];
  }
}
