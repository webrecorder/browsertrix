/**
 * Ignore events bubbling from children. Common use case would be
 * ignoring @sl-hide events from tooltips within a dialog.
 *
 * @example Usage:
 * ```
 * <btrix-element
 *   @sl-hide=${makeCurrentTargetHandler(this)(() => console.log("Only current target!"))}
 * >
 * </btrix-element>
 * ```
 */
export function makeCurrentTargetHandler(t: EventTarget) {
  const currentTargetHandler: <T extends Event = CustomEvent>(
    handler: (event: T) => void,
  ) => (event: T) => void = (handler) => (e) => {
    if (e.target === e.currentTarget) {
      handler.bind(t)(e);
    }
  };

  return currentTargetHandler;
}

/**
 * Stop propgation shorthand.
 *
 * @example Usage:
 * ```
 * <btrix-element
 *   @sl-show=${stopProp}
 * >
 * </btrix-element>
 * ```
 */
export function stopProp(e: Event) {
  e.stopPropagation();
}
