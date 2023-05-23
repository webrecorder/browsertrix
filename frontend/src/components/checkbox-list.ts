import { SlCheckbox } from "@shoelace-style/shoelace";
import { LitElement, html, css } from "lit";
import {
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";

export type CheckboxChangeEvent = CustomEvent<{
  checked: boolean;
}>;

// Shared custom variables
const hostVars = css`
  :host {
    --row-offset: var(--sl-spacing-x-small);
  }
`;

/**
 * @event on-change CheckboxChangeEvent
 */
export class CheckboxListItem extends LitElement {
  static styles = [
    hostVars,
    css`
      .item {
        cursor: pointer;
        transition-property: background-color, box-shadow;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        overflow: hidden;
        border-top: var(--item-border-top, 0);
        border-left: var(--item-border-left, 0);
        border-right: var(--item-border-right, 0);
        border-bottom: var(--item-border-bottom, 0);
        border-radius: var(--item-border-radius, 0);
        box-shadow: var(--item-box-shadow, none);
        display: flex;
        align-items: center;
      }

      .item:hover,
      .item:focus,
      .item:focus-within {
        background-color: var(--sl-color-neutral-50);
      }

      .item:hover {
        background-color: var(--sl-color-neutral-50);
        box-shadow: var(--sl-shadow-small);
      }

      .checkbox {
        --checkbox-margin: 0.625rem;
        flex: 0 0 auto;
        margin-top: var(--checkbox-margin);
        margin-bottom: var(--checkbox-margin);
        margin-left: var(--sl-spacing-small);
        margin-right: calc(var(--sl-spacing-small) - 0.5em);
      }

      .content {
        flex-grow: 1;
      }

      .group {
        overflow: hidden;
      }
    `,
  ];

  @property({ type: Boolean })
  checked = false;

  @property({ type: Boolean })
  allChecked = false;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  group = false;

  @query("sl-checkbox")
  private checkbox!: SlCheckbox;

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("checked")) {
      this.checked = this.checked;
    }
  }

  render() {
    return html`
      <div
        class="item"
        role="checkbox"
        aria-checked=${this.checked &&
        (this.group && !this.allChecked ? "mixed" : "true")}
        aria-disabled=${this.disabled}
        @click=${async (e: MouseEvent) => {
          if (this.disabled) return;
          this.onChange(!this.checkbox.checked);
        }}
      >
        ${this.renderCheckbox()}
        <div class="content">
          <slot></slot>
        </div>
      </div>
      ${this.group
        ? html`<div class="group"><slot name="group"></slot></div>`
        : ""}
    `;
  }

  private renderCheckbox() {
    const isIndeterminate = this.group && this.checked && !this.allChecked;
    return html`<div class="checkbox">
      <sl-checkbox
        ?checked=${this.checked && !isIndeterminate}
        ?indeterminate=${isIndeterminate}
        ?disabled=${this.disabled}
        @click=${(e: MouseEvent) => {
          e.stopPropagation();
        }}
        @sl-change=${(e: Event) => {
          e.stopPropagation();
          this.onChange((e.target as SlCheckbox).checked);
        }}
      ></sl-checkbox>
    </div>`;
  }

  private async onChange(value: boolean) {
    this.checked = value;
    await this.updateComplete;
    this.dispatchEvent(
      <CheckboxChangeEvent>new CustomEvent("on-change", {
        detail: {
          checked: value,
        },
      })
    );
  }
}

export class CheckboxGroupList extends LitElement {
  static styles = [
    hostVars,
    css`
      .list {
        margin-left: var(--row-offset);
        margin-right: var(--row-offset);
      }

      ::slotted(btrix-checkbox-list-item) {
        --border: 1px solid var(--sl-panel-border-color);
        --item-border-top: 0;
        --item-box-shadow: none;
      }

      ::slotted(btrix-checkbox-list-item:not(:last-of-type)) {
        --item-border-radius: 0;
      }

      ::slotted(btrix-checkbox-list-item:last-of-type) {
        --item-border-radius: 0 0 var(--sl-border-radius-medium)
          var(--sl-border-radius-medium);
      }
    `,
  ];

  @queryAssignedElements({ selector: "btrix-checkbox-list-item" })
  private listItems!: Array<HTMLElement>;

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

export class CheckboxList extends LitElement {
  static styles = [
    hostVars,
    css`
      .list {
        margin-left: var(--row-offset);
        margin-right: var(--row-offset);
      }

      ::slotted(btrix-checkbox-list-item) {
        --border: 1px solid var(--sl-panel-border-color);
        --item-border-top: var(--border);
        --item-border-left: var(--border);
        --item-border-right: var(--border);
        --item-border-bottom: var(--border);
        --item-box-shadow: var(--sl-shadow-x-small);
        --item-border-radius: var(--sl-border-radius-medium);
        display: block;
      }

      ::slotted(btrix-checkbox-list-item:not(:last-of-type)) {
        margin-bottom: var(--sl-spacing-x-small);
      }
    `,
  ];

  @queryAssignedElements({ selector: "btrix-checkbox-list-item" })
  listItems!: Array<HTMLElement>;

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
