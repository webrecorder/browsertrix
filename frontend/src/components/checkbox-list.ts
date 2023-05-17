import { LitElement, html, css } from "lit";
import { property, queryAssignedElements } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

export type CheckboxChangeEvent = CustomEvent<{
  checked: boolean;
}>;

// Shared custom variables
const hostVars = css`
  :host {
    --row-offset: var(--sl-spacing-x-small);
  }
`;
// From https://github.com/shoelace-style/shoelace/blob/v2.0.0-beta.85/src/components/checkbox/checkbox.styles.ts
const checkboxStyles = css`
  .checkbox {
    display: inline-flex;
    align-items: top;
    font-family: var(--sl-input-font-family);
    font-size: var(--sl-input-font-size-medium);
    font-weight: var(--sl-input-font-weight);
    color: var(--sl-input-color);
    vertical-align: middle;
    cursor: pointer;
  }

  .checkbox__control {
    flex: 0 0 auto;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--sl-toggle-size);
    height: var(--sl-toggle-size);
    border: solid var(--sl-input-border-width) var(--sl-input-border-color);
    border-radius: 2px;
    background-color: var(--sl-input-background-color);
    color: var(--sl-color-neutral-0);
    transition: var(--sl-transition-fast) border-color,
      var(--sl-transition-fast) background-color,
      var(--sl-transition-fast) color, var(--sl-transition-fast) box-shadow;
  }

  .checkbox__control .checkbox__icon {
    display: inline-flex;
    width: var(--sl-toggle-size);
    height: var(--sl-toggle-size);
  }

  /* Hover */
  .checkbox:not(.checkbox--checked):not(.checkbox--disabled)
    .checkbox__control:hover {
    border-color: var(--sl-input-border-color-hover);
    background-color: var(--sl-input-background-color-hover);
  }

  /* Checked */
  .checkbox--checked .checkbox__control {
    border-color: var(--sl-color-primary-600);
    background-color: var(--sl-color-primary-600);
  }

  /* Checked + hover */
  .checkbox.checkbox--checked:not(.checkbox--disabled)
    .checkbox__control:hover
    .checkbox__control:hover {
    border-color: var(--sl-color-primary-500);
    background-color: var(--sl-color-primary-500);
  }
`;

/**
 * @event on-change CheckboxChangeEvent
 */
export class CheckboxListItem extends LitElement {
  static styles = [
    checkboxStyles,
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
        flex: 0 0 auto;
        margin: var(--sl-spacing-small) var(--sl-spacing-medium);
      }

      .content {
        flex: 1 1 auto;
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

  render() {
    return html`
      <div
        class="item"
        role="checkbox"
        aria-checked=${this.checked &&
        (this.group && !this.allChecked ? "mixed" : "true")}
        @click=${() => {
          this.dispatchEvent(
            <CheckboxChangeEvent>new CustomEvent("on-change", {
              detail: {
                checked: !this.checked,
              },
            })
          );
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
    // The `indeterminate` prop doesn't seem to be working properly,
    // using checkbox instead
    return html`
      <div
        class=${classMap({
          checkbox: true,
          "checkbox--checked": this.checked,
          "checkbox--disabled": this.disabled,
        })}
      >
        <span class="checkbox__control">
          ${this.checked
            ? this.group && !this.allChecked
              ? html`<sl-icon library="system" name="indeterminate"></sl-icon>`
              : html`<sl-icon library="system" name="check"></sl-icon>`
            : ""}
        </span>
      </div>
    `;
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
