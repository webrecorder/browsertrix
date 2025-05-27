import { msg } from "@lit/localize";
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.js";
import { customElement, property } from "lit/decorators.js";

export function validURL(url: string) {
  // adapted from: https://gist.github.com/dperini/729294
  return /^(?:https?:\/\/)?(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
    url,
  );
}

/**
 * URL input field with validation.
 *
 * @TODO Use types from SlInput
 *
 * @attr {String} name
 * @attr {String} size
 * @attr {String} name
 * @attr {String} label
 * @attr {String} value
 * @attr {Boolean} required
 */
@customElement("btrix-url-input")
export class UrlInput extends SlInput {
  @property({ type: Number, reflect: true })
  minlength = 4;

  @property({ type: String, reflect: true })
  placeholder = "https://example.com";

  @property({ type: Boolean })
  hideHelpText = false;

  constructor() {
    super();

    this.inputmode = "url";

    this.addEventListener("sl-input", this.onInput);
    this.addEventListener("sl-change", this.onChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    this.removeEventListener("sl-input", this.onInput);
    this.removeEventListener("sl-change", this.onChange);
  }

  private readonly onInput = () => {
    if (!this.checkValidity() && validURL(this.value)) {
      this.setCustomValidity("");
      if (!this.hideHelpText) this.helpText = "";
    }
  };

  private readonly onChange = () => {
    const value = this.value.trim();

    if (value && !validURL(value)) {
      const text = msg("Please enter a valid URL.");
      if (!this.hideHelpText) this.helpText = text;
      this.setCustomValidity(text);
    } else if (
      value &&
      !value.startsWith("https://") &&
      !value.startsWith("http://")
    ) {
      this.value = `https://${value}`;
    }
  };
}
