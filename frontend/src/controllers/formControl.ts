import type {
  LitElement,
  ReactiveController,
  ReactiveControllerHost,
} from "lit";

/**
 * Adds `user-valid`, and `user-invalid` data attributes to custom
 * form-associated elements (e.g. ones created with `FormControl`)
 * to match Shoelace forms.
 */
export class FormControlController implements ReactiveController {
  readonly #host: ReactiveControllerHost & LitElement;

  #oneUserInput = false;

  constructor(host: ReactiveControllerHost & LitElement) {
    this.#host = host;
    host.addController(this);
  }

  hostConnected() {
    const inputEvents = ["sl-input", "btrix-input"];
    const changeEvents = ["sl-change", "btrix-change"];

    inputEvents.forEach((name) => {
      this.#host.addEventListener(
        name,
        () => {
          this.#oneUserInput = true;
        },
        { once: true },
      );
    });

    // IDEA Mutation observer with attributeFilter to `value` could work
    // if custom form controls consistently set a value, in the future
    changeEvents.forEach((name) => {
      this.#host.addEventListener(name, async (e: Event) => {
        const el = e.target as LitElement;

        if (this.#oneUserInput && "validity" in el && el.validity) {
          await el.updateComplete;

          // Add user-valid or user-invalid to match `ShoelaceFormControl`
          if ((el.validity as ValidityState).valid) {
            el.setAttribute("user-valid", "");
            el.removeAttribute("user-invalid");
          } else {
            el.setAttribute("user-invalid", "");
            el.removeAttribute("user-valid");
          }
        }
      });
    });
  }

  hostDisconnected() {}
}
