import { msg } from "@lit/localize";

export const validationMessageFor: Partial<
  Record<keyof ValidityStateFlags, string>
> = {
  valueMissing: msg("Please fill out this field."),
};
