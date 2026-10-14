setupLinks();

// Based on https://github.com/JakubAndrysek/mkdocs-open-in-new-tab
function setupLinks() {
  if (typeof document$ !== "undefined") {
    // Compatibility with mkdocs-material's instant loading feature
    document$.subscribe(() => {
      updateLinks();
    });
  } else {
    // For browsers without mkdocs-material's instant loading feature
    updateLinks();
  }
}

function updateLinks() {
  document.querySelectorAll('a[href^="http"]').forEach((el) => {
    if (el.host !== window.location.host) {
      el.target = "_blank";
      el.rel = "noopener";
    }
  });
}
