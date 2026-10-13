setupSearch();

function setupSearch() {
  openSearchIfParams();
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
