import type { ReactiveController } from "lit";
import {
  focusable,
  isFocusable,
  isTabbable,
  tabbable,
  type FocusableElement,
} from "tabbable";

import type { DataGridCell } from "../data-grid-cell";
import type { DataGridRow } from "../data-grid-row";
import { type GridItem } from "../types";

type Options = {
  /**
   * Set focus on first non-input item according to
   * tabindex, rather than DOM order.
   */
  setFocusOnTabbable?: boolean;
};

/**
 * Utilities for managing focus in a data grid.
 */
export class DataGridFocusController<const T extends GridItem = GridItem>
  implements ReactiveController
{
  readonly #host: DataGridRow<T> | DataGridCell<T>;

  constructor(
    host: DataGridRow<T> | DataGridCell<T>,
    opts: Options = {
      setFocusOnTabbable: false,
    },
  ) {
    this.#host = host;
    host.addController(this);

    this.#host.addEventListener(
      "focus",
      () => {
        if (!this.#host.matches(":focus-visible")) {
          // Only handle focus on keyboard tabbing
          return;
        }

        // Move focus from table cell to on first tabbable element
        const el = opts.setFocusOnTabbable
          ? this.firstTabbable
          : this.firstFocusable;

        if (el) {
          if (this.isFocusableInput(el)) {
            this.#host.addEventListener("keydown", this.#onFocusForEl(el), {
              once: true,
              capture: true,
            });
          } else {
            el.focus();
          }
        }

        // Show tooltip on tab focus. Tooltip on any focus should be
        // disabled in `btrix-data-grid-row` to prevent tooltips being
        // showing duplicate messages during form submission.
        const tooltip = this.#host.closest("sl-tooltip");

        if (tooltip && !tooltip.disabled) {
          const hideTooltip = () => {
            void tooltip.hide();
            this.#host.removeEventListener("input", hideTooltip);
            this.#host.removeEventListener("blur", hideTooltip);
          };

          this.#host.addEventListener("input", hideTooltip, {
            once: true,
          });
          this.#host.addEventListener("blur", hideTooltip, {
            once: true,
          });

          void tooltip.show();
        }
      },
      { passive: true, capture: true },
    );
  }

  hostConnected() {}
  hostDisconnected() {}

  /**
   * Focusable elements in DOM order. This will include
   * all focusable elements, including elements with `tabindex="1"`.
   */
  public get focusable() {
    return focusable(this.#host, {
      getShadowRoot: true,
    });
  }

  /**
   * Focusable elements in `tabindex` order.
   */
  public get tabbable() {
    return tabbable(this.#host, {
      getShadowRoot: true,
    });
  }

  public get firstFocusable(): FocusableElement | undefined {
    return this.focusable[0];
  }

  public get firstTabbable(): FocusableElement | undefined {
    return this.tabbable[0];
  }

  public isFocusable(el: Element) {
    return isFocusable(el);
  }

  public isTabbable(el: Element) {
    return isTabbable(el);
  }

  public isFocusableInput(el: Element) {
    // TODO Handle `<sl-select>`/`<sl-option>`
    return el.tagName === "INPUT" && this.isFocusable(el);
  }

  /**
   * Based on recommendations from
   * https://www.w3.org/WAI/ARIA/apg/patterns/grid/#keyboardinteraction-settingfocusandnavigatinginsidecells
   */
  readonly #onFocusForEl = (el: FocusableElement) => (e: KeyboardEvent) => {
    const { key } = e;

    switch (key) {
      case "Tab": {
        // Prevent entering cell
        e.preventDefault();
        break;
      }
      case "Enter": {
        e.preventDefault();

        // Enter cell and focus on input
        el.focus();
        break;
      }
      default: {
        if (key.length === 1) {
          // Enter cell and focus on input
          el.focus();
        }
        break;
      }
    }
  };
}
