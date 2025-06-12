import { css, html } from "lit";
import { customElement, queryAssignedElements } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-file-list")
export class FileList extends TailwindElement {
  static styles = [
    css`
      ::slotted(btrix-file-list-item) {
        --border: 1px solid var(--sl-panel-border-color);
        --item-border-top: var(--border);
        --item-border-left: var(--border);
        --item-border-right: var(--border);
        --item-border-bottom: var(--border);
        --item-box-shadow: var(--sl-shadow-x-small);
        --item-border-radius: var(--sl-border-radius-medium);
        display: block;
      }

      ::slotted(btrix-file-list-item:not(:last-of-type)) {
        margin-bottom: var(--sl-spacing-x-small);
      }
    `,
  ];

  @queryAssignedElements({ selector: "btrix-file-list-item" })
  listItems!: HTMLElement[];

  render() {
    return html`<div class="list" role="list">
      <slot @slotchange=${this.handleSlotchange}></slot>
    </div>`;
  }

  private handleSlotchange() {
    this.listItems.map((el) => {
      if (!el.attributes.getNamedItem("role")) {
        el.setAttribute("role", "listitem");
      }
    });
  }
}
