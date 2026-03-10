import SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import { css } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

/**
 * <sl-dialog> with custom CSS
 *
 * Usage: see https://shoelace.style/components/dialog
 *
 * @attr label
 * @attr open
 * @attr noHeader
 */
@customElement("btrix-dialog")
export class Dialog extends SlDialog {
  static styles = [
    SlDialog.styles,
    css`
      :host {
        --header-spacing: var(--sl-spacing-medium);
        --body-spacing: var(--sl-spacing-medium);
        --footer-spacing: var(--sl-spacing-medium);
      }

      .dialog__panel {
        overflow: hidden;
      }

      .dialog__header {
        border-bottom: 1px solid var(--sl-panel-border-color);
      }

      .dialog__title {
        padding-top: calc(var(--sl-spacing-small) + 0.2rem);
        padding-bottom: var(--sl-spacing-small);
        font-size: var(--font-size-base);
        font-weight: var(--sl-font-weight-medium);
        line-height: 1;
      }

      .dialog__close {
        --header-spacing: var(--sl-spacing-x-small);
      }

      .dialog__body {
        line-height: var(--sl-line-height-normal);
        text-wrap: pretty;
      }

      .dialog__footer {
        padding-top: var(--sl-spacing-small);
        padding-bottom: var(--sl-spacing-small);
        border-top: 1px solid var(--sl-panel-border-color);
      }
    `,
  ];

  @queryAssignedElements({ selector: "form", flatten: true })
  readonly formElems!: HTMLFormElement[];

  @property({ type: Boolean })
  reEmitInnerSlHideEvents = false;

  // Because both `sl-tooltip` and `sl-dialog` elements use "sl-hide", anything
  // that listens for "sl-hide" events receives them from tooltips inside the
  // dialog as well as from the dialog itself, which can lead to mousing out of
  // a tooltip causing the dialog to close (if it's used as a fully-controlled
  // component). This prevents that by catching any "sl-hide" events, and
  // optionally re-emitting them as "sl-inner-hide" events
  protected createRenderRoot() {
    const root = super.createRenderRoot();
    root.addEventListener("sl-hide", this.handleSlEvent);
    root.addEventListener("sl-after-hide", this.handleSlEvent);
    return root;
  }

  private readonly handleSlEvent = (event: Event) => {
    if (!(event.target instanceof Dialog)) {
      event.stopPropagation();
      if (this.reEmitInnerSlHideEvents) {
        this.dispatchEvent(new CustomEvent("sl-inner-hide", { ...event }));
      }
    }
  };

  /**
   * Submit form using external buttons to bypass
   * incorrect `getRootNode` in Chrome.
   *
   * TODO refactor dialog instances that self implements `form.requestSubmit`
   */
  submit = () => {
    this.formElems[0]?.requestSubmit();
  };
}
