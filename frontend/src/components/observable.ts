import { LitElement, html } from "lit";
import { query } from "lit/decorators.js";

export type IntersectEvent = CustomEvent<{
  entry: IntersectionObserverEntry;
}>;

/**
 * Observe element with Intersection Obserer API.
 *
 * @event intersect { entry: IntersectionObserverEntry }
 */
export class Observable extends LitElement {
  @query(".target")
  private target?: HTMLElement;

  private observer?: IntersectionObserver;

  connectedCallback(): void {
    super.connectedCallback();
    this.observer = new IntersectionObserver(this.handleIntersect);
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
  }

  firstUpdated() {
    this.observer?.observe(this.target!);
  }

  private handleIntersect = ([entry]: IntersectionObserverEntry[]) => {
    this.dispatchEvent(
      <IntersectEvent>new CustomEvent("intersect", {
        detail: { entry },
      })
    );
  };

  render() {
    return html`<div class="target"><slot></slot></div>`;
  }
}
