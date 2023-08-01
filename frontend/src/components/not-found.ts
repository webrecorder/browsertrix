import { LitElement, html } from "lit";
import { msg, localized } from "@lit/localize";

@localized()
export class NotFound extends LitElement {
  createRenderRoot() {
    return this;
  }
  render() {
    return html`
      <div class="text-xl text-gray-400 text-center">
        ${msg("Page not found")}
      </div>
    `;
  }
}
