import type { LitElement } from "lit";
import type { Constructor } from "type-fest";

/**
 * Associate a custom element with a form.
 */
export const FormControl = <T extends Constructor<LitElement>>(superClass: T) =>
  class extends superClass {
    static formAssociated = true;
    readonly #internals: ElementInternals;

    get form() {
      return this.#internals.form;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);

      this.tabIndex = Math.max(this.tabIndex, 0);
      this.#internals = this.attachInternals();
    }

    public formAssociatedCallback() {}
    public formResetCallback() {}
    public formDisabledCallback(_disabled: boolean) {}
    public formStateRestoreCallback(
      _state: string | FormData,
      _reason: string,
    ) {}

    public checkValidity(): boolean {
      return this.#internals.checkValidity();
    }

    public reportValidity(): boolean {
      return this.#internals.reportValidity();
    }

    public get validity(): ValidityState {
      return this.#internals.validity;
    }

    public get validationMessage(): string {
      return this.#internals.validationMessage;
    }

    protected setFormValue(
      ...args: Parameters<ElementInternals["setFormValue"]>
    ): void {
      this.#internals.setFormValue(...args);
    }

    protected setValidity(
      ...args: Parameters<ElementInternals["setValidity"]>
    ): void {
      this.#internals.setValidity(...args);
    }
  };
