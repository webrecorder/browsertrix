import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

type IntersectionEventDetail = {
  entry: IntersectionObserverEntry;
};
export type IntersectEvent = CustomEvent<IntersectionEventDetail>;

/**
 * Observe element with Intersection Observer API.
 *
 * @example Usage:
 * ```
 * <btrix-observable @btrix-intersect=${console.log}>
 *   Observe me!
 * </btrix-observable>
 * ```
 *
 * @fires btrix-intersect { entry: IntersectionObserverEntry }
 */
@customElement("btrix-observable")
export class Observable extends LitElement {
  @property({ type: Object })
  options?: IntersectionObserverInit;

  private observer?: IntersectionObserver;

  connectedCallback(): void {
    super.connectedCallback();
    this.observer = new IntersectionObserver(
      this.handleIntersect,
      this.options,
    );
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.observer?.observe(this);
  }

  private readonly handleIntersect = ([entry]: IntersectionObserverEntry[]) => {
    this.dispatchEvent(
      new CustomEvent<IntersectionEventDetail>("btrix-intersect", {
        detail: { entry },
      }),
    );
  };

  render() {
    return html`<slot></slot>`;
  }
}
