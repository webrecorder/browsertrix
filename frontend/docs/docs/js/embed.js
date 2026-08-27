if (window.self !== window.top) {
  // Within iframe--assume this is an iframe embedded in the Browsertrix app.
  window.document.documentElement.classList.add("btrix-app-embed");

  replaceDocsTitle();
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
