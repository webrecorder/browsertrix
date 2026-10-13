setupSearch();

function setupSearch() {
  openSearchIfParams();

  if (window.self !== window.top) {
    try {
      styleSearchComponent();
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * Recreate Mkdocs Material deep link into open search modal until
 * https://github.com/zensical/backlog/issues/119 is resolved
 */
function openSearchIfParams() {
  if (isSearching()) {
    openSearch();
  }
}

function isSearching() {
  const url = new URL(window.location.href);

  return url.searchParams.has("q");
}

function openSearch() {
  if (!isSearching()) return;

  const searchButton = document.querySelector(".md-search__button");

  if (!searchButton) {
    console.debug(
      'no searchButton `document.querySelector(".md-search__button)`',
    );
    return;
  }

  searchButton.click();
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
