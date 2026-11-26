setupSearch();

function setupSearch() {
  idSearchComponent();
  styleSearchComponent();
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

    // FIXME Instant navigation seems to break clicking into search results;
    // the search modal is re-opened after navigation completes.
    // Disable instant navigation for now by preventing the click from bubbling.
    el.addEventListener(
      "click",
      (e) => {
        if (e.composedPath().some((el) => el.href)) {
          e.stopPropagation();
        }
      },
      { capture: true },
    );
  } else {
    console.debug(
      "no previous element sibling with shadow root, cannot ID search component",
    );
  }
}

function styleSearchComponent() {
  // ID added by search.js
  const el = document.getElementById("search-component");

  if (!el) {
    console.debug("no element with ID `search-component`, cannot apply styles");
    return;
  }

  // The dialog width is 100vw by default which causes a layout shift
  const styles = `.r { width: 100%; overflow: hidden; }`;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);

  el.shadowRoot.adoptedStyleSheets = [
    ...el.shadowRoot.adoptedStyleSheets,
    sheet,
  ];
}
