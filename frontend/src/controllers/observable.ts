import type { ReactiveController, ReactiveControllerHost } from "lit";

type IntersectionEventDetail = {
  entries: IntersectionObserverEntry[];
};
export type IntersectEvent = CustomEvent<IntersectionEventDetail>;

/**
 * Observe one or more elements with Intersection Observer API.
 *
 * @fires btrix-intersect IntersectionEventDetail
 */
export class ObservableController implements ReactiveController {
  private readonly host: ReactiveControllerHost & EventTarget;

  private observer?: IntersectionObserver;
  private readonly observerOptions?: IntersectionObserverInit;

  constructor(
    host: ObservableController["host"],
    options?: IntersectionObserverInit,
  ) {
    this.host = host;
    this.observerOptions = options;
    host.addController(this);
  }

  hostConnected() {
    this.observer = new IntersectionObserver(
      this.handleIntersect,
      this.observerOptions,
    );
  }

  hostDisconnected() {
    this.observer?.disconnect();
  }

  public observe(target: Element) {
    this.observer?.observe(target);
  }

  private readonly handleIntersect = (entries: IntersectionObserverEntry[]) => {
    this.host.dispatchEvent(
      new CustomEvent<IntersectionEventDetail>("btrix-intersect", {
        detail: { entries },
      }),
    );
  };
}
