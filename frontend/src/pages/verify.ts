import { state, property, query } from "lit/decorators.js";

import LiteElement, { html } from "../utils/LiteElement";

export class Verify extends LiteElement {
  render() {
    return html` <div class="text-4xl"><sl-spinner></sl-spinner></div> `;
  }
}
