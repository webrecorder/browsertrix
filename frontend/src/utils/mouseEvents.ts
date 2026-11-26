export function isNewTabClick(e: MouseEvent) {
  // e.metaKey - Mac
  // e.ctrlKey - Windows/Linux
  // e.button - Left-click
  if ((e.metaKey || e.ctrlKey) && e.button === 0) {
    return true;
  }

  return false;
}
