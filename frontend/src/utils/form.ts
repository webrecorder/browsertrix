import { msg, str } from "@lit/localize";
import type { SlInput, SlTextarea } from "@shoelace-style/shoelace";

/**
 * Validate field max length and set custom message
 * Usage:
 * ```
 * const { helpText, validate } = maxLengthValidator(10)
 *
 * <sl-input
 *   help-text=${helpText}
 *   @sl-input=${validate}
 * ></sl-input>
 * ```
 */
export function maxLengthValidator(maxLength: number): {
  helpText: string;
  validate: (e: CustomEvent) => void;
} {
  const helpText = msg(str`Maximum ${maxLength} characters`);
  const validate = (e: CustomEvent) => {
    const el = e.target as SlTextarea | SlInput;
    if (el.value.length > maxLength) {
      const overMax = el.value.length - maxLength;
      el.setCustomValidity(
        msg(str`Please shorten this text to ${maxLength} or less characters.`)
      );
      el.helpText =
        overMax === 1
          ? msg(str`${overMax} character over limit`)
          : msg(str`${overMax} characters over limit`);
    } else {
      el.setCustomValidity("");
      el.helpText = helpText;
    }
  };

  return { helpText, validate };
}
