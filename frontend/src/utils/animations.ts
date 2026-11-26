// Based on https://github.com/shoelace-style/shoelace/blob/25bd8ec776609670a932f21390be59a495df497d/src/internal/animate.ts#L44

/**
 * Animates an element using keyframes. Returns a promise that resolves after the animation completes or gets canceled.
 */
export async function animateTo(
  el: HTMLElement,
  keyframes: Keyframe[],
  options?: KeyframeAnimationOptions,
) {
  return new Promise((resolve) => {
    if (options?.duration === Infinity) {
      throw new Error("Promise-based animations must be finite.");
    }

    const animation = el.animate(keyframes, {
      ...options,
      duration: prefersReducedMotion() || !options ? 0 : options.duration,
    });

    animation.addEventListener("cancel", resolve, { once: true });
    animation.addEventListener("finish", resolve, { once: true });
  });
}

/** Tells if the user has enabled the "reduced motion" setting in their browser or OS. */
export function prefersReducedMotion() {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  return query.matches;
}

/**
 * Stops all active animations on the target element. Returns a promise that resolves after all animations are canceled.
 */
export async function stopAnimations(el: HTMLElement) {
  return Promise.all(
    el.getAnimations().map(async (animation) => {
      return new Promise((resolve) => {
        animation.cancel();
        requestAnimationFrame(resolve);
      });
    }),
  );
}
