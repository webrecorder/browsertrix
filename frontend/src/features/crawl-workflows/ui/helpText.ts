import { msg } from "@lit/localize";

import { type FormState } from "@/utils/workflow";

type Field = keyof FormState;

const strings: Partial<Record<Field, string>> = {
  pageLimit: msg(
    "Adds a hard limit on the number of pages that will be crawled.",
  ),
};

export function helpText(field: Field) {
  return strings[field] || "";
}
