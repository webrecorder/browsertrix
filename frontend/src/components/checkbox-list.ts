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
        border: 1px solid var(--sl-panel-border-color);
        border-radius: var(--sl-border-radius-medium);
        box-shadow: var(--sl-shadow-x-small);
        padding: var(--sl-spacing-small);
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
    `,
  ];

  @property({ type: Boolean })
  checked = false;

  @property({ type: Boolean })
  disabled = false;

  render() {
    return html`
      <div
        class="item"
        role="checkbox"
        aria-checked=${this.checked}
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
        <slot></slot>
      </div>
    `;
  }

  private renderCheckbox() {
    return html`
      <div
        class=${classMap({
          checkbox: true,
          "checkbox--checked": this.checked,
          "checkbox--disabled": this.disabled,
        })}
      >
        <span part="control" class="checkbox__control">
          ${this.checked
            ? html`
                <sl-icon
                  part="checked-icon"
                  library="system"
                  name="check"
                ></sl-icon>
              `
            : ""}
        </span>
      </div>
    `;
  }
}

export class CheckboxList extends LitElement {
  static styles = [
    hostVars,
    css`
      .listHeader,
      .list {
        margin-left: var(--row-offset);
        margin-right: var(--row-offset);
      }

      ::slotted(btrix-checkbox-list-item) {
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
