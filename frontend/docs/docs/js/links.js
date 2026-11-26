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
  // Open external links in a new tab
  document.querySelectorAll(`a[href^="http"]`).forEach((el) => {
    if (el.host !== window.location.host) {
      if (!el.target) {
        el.target = "_blank";
      }
      if (el.target === "_blank") {
        el.rel = "noopener";
      }
    }
  });
}
