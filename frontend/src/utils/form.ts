import { msg, str } from "@lit/localize";
import type { SlInput, SlTextarea } from "@shoelace-style/shoelace";
import {
  getFormControls,
  serialize,
} from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { LitElement } from "lit";
import isEqual from "lodash/fp/isEqual";
import type { EmptyObject } from "type-fest";

import localize from "./localize";
import { pluralize } from "./pluralize";

export type MaxLengthValidator = {
  helpText: string;
  validate: (e: CustomEvent) => boolean;
};

const helpTextNormal = (maxLength: number) => {
  const max = localize.number(maxLength);
  return pluralize(maxLength, {
    zero: msg(str`Maximum ${max} characters`, {
      id: "maxLengthValidator.helpText.zero",
    }),
    one: msg(str`Maximum ${max} character`, {
      id: "maxLengthValidator.helpText.one",
    }),
    two: msg(str`Maximum ${max} characters`, {
      id: "maxLengthValidator.helpText.two",
    }),
    few: msg(str`Maximum ${max} characters`, {
      id: "maxLengthValidator.helpText.few",
    }),
    many: msg(str`Maximum ${max} characters`, {
      id: "maxLengthValidator.helpText.many",
    }),
    other: msg(str`Maximum ${max} characters`, {
      id: "maxLengthValidator.helpText.other",
    }),
  });
};

export function getHelpText(maxLength: number, currentLength: number) {
  if (currentLength > maxLength) {
    const overMax = localize.number(currentLength - maxLength);
    return pluralize(currentLength - maxLength, {
      zero: "",
      one: msg(str`${overMax} character over limit`, {
        id: "maxLengthValidator.helpTextError.one",
      }),
      two: msg(str`${overMax} characters over limit`, {
        id: "maxLengthValidator.helpTextError.two",
      }),
      few: msg(str`${overMax} characters over limit`, {
        id: "maxLengthValidator.helpTextError.few",
      }),
      many: msg(str`${overMax} characters over limit`, {
        id: "maxLengthValidator.helpTextError.many",
      }),
      other: msg(str`${overMax} characters over limit`, {
        id: "maxLengthValidator.helpTextError.other",
      }),
    });
  }

  return helpTextNormal(maxLength);
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
  const max = localize.number(maxLength);
  const validityHelpText = helpTextNormal(maxLength);
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
        ? msg(str`Please shorten this text to ${max} or fewer characters.`)
        : "",
    );

    el.helpText = isInvalid ? validityText : origHelpText || validityHelpText;
    return !isInvalid;
  };

  return { helpText: validityHelpText, validate };
}

/**
 * Validate form based on whether it contains an invalid Shoelace element
 *
 * @TODO Refactor forms to use utility
 */
export function formValidator(el: LitElement) {
  return async function checkFormValidity(form: HTMLFormElement) {
    await el.updateComplete;

    const valid = form.checkValidity();

    if (!valid) return false;

    const formControls = getFormControls(form);

    return (
      !form.querySelector("[data-invalid]") &&
      !formControls.some((el) => el.getAttribute("data-invalid") !== null)
    );
  };
}

/**
 * Serialize forms with stringified JSON data, likely
 * when used with `<btrix-data-grid>`.
 */
export function serializeDeep(
  form: HTMLFormElement,
  opts?: {
    parseKeys: string[];
    filterEmpty?: boolean | Record<string, unknown> | EmptyObject;
  },
) {
  const values = serialize(form);

  if (opts) {
    opts.parseKeys.forEach((key) => {
      const val = values[key];

      if (typeof val === "string") {
        values[key] = JSON.parse(val);
      } else if (Array.isArray(val)) {
        const arr: unknown[] = [];

        val.forEach((v) => {
          if (opts.filterEmpty === true && !v) return;

          const value = typeof v === "string" ? JSON.parse(v) : v;

          if (opts.filterEmpty && isEqual(opts.filterEmpty, value)) return;

          arr.push(value);
        });

        values[key] = arr;
      }
    });
  }

  return values;
}
