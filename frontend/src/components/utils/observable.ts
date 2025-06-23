import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

import { ObservableController } from "@/controllers/observable";

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
 * @fires btrix-intersect IntersectionEventDetail
 */
@customElement("btrix-observable")
export class Observable extends LitElement {
  @property({ type: Object })
  options?: IntersectionObserverInit;

  private observable?: ObservableController;

  connectedCallback(): void {
    super.connectedCallback();
    this.observable = new ObservableController(this, this.options);
  }

  firstUpdated() {
    this.observable?.observe(this);
  }

  render() {
    return html`<slot></slot>`;
  }
}
