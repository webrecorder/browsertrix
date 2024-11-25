import { msg, str } from "@lit/localize";
import type { SlInput, SlTextarea } from "@shoelace-style/shoelace";

import localize from "./localize";

export type MaxLengthValidator = {
  helpText: string;
  validate: (e: CustomEvent) => void;
};

export function getHelpText(maxLength: number, currentLength: number) {
  const helpText = msg(str`Maximum ${localize.number(maxLength)} characters`);

  if (currentLength > maxLength) {
    const overMax = currentLength - maxLength;
    return overMax === 1
      ? msg(str`${localize.number(overMax)} character over limit`)
      : msg(str`${localize.number(overMax)} characters over limit`);
  }

  return helpText;
}

/**
 * Validate field max length and set custom message in Shoelace inputs.
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
export function maxLengthValidator(maxLength: number): MaxLengthValidator {
  const validityHelpText = msg(str`Maximum ${maxLength} characters`);
  let origHelpText: null | string = null;

  const validate = (e: CustomEvent) => {
    const el = e.target as SlTextarea | SlInput;

    if (origHelpText === null && el.helpText) {
      origHelpText = el.helpText;
    }

    const validityText = getHelpText(maxLength, el.value.length);
    const isInvalid = el.value.length > maxLength;

    el.setCustomValidity(
      isInvalid
        ? msg(
            str`Please shorten this text to ${maxLength} or fewer characters.`,
          )
        : "",
    );

    el.helpText = isInvalid ? validityText : origHelpText || validityHelpText;
  };

  return { helpText: validityHelpText, validate };
}
