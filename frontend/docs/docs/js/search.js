setupSearch();

function setupSearch() {
  idSearchComponent();
}

/**
 * HACK Zensical doesn't currently allow customizing the search component
 * (https://github.com/zensical/ui/tree/master/src/assets/javascripts/components/search)
 * so this script must be positioned after where the search UI is added.
 */
function idSearchComponent() {
  const scripts = document.getElementsByTagName("script");
  let currEl = scripts[scripts.length - 1];

  while (currEl.previousElementSibling.tagName !== "DIV") {
    currEl = currEl.previousElementSibling;
  }

  const el = currEl.previousElementSibling;

  if (el.shadowRoot) {
    el.setAttribute("id", "search-component");
  } else {
    console.debug(
      "no previous element sibling with shadow root, cannot ID search component",
    );
  }
}
