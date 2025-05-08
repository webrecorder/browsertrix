import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { Language } from "@/components/ui/code";
import type { SyntaxInput } from "@/components/ui/syntax-input";

import "@/components/ui/syntax-input";

export { Language };

export type RenderProps = Pick<SyntaxInput, keyof SyntaxInput> & {
  name?: string;
};

export const defaultArgs = {
  value: "<div>Edit me</div>",
  language: Language.XML,
  placeholder: "Enter HTML",
} satisfies Partial<RenderProps>;

export const renderComponent = (opts: Partial<RenderProps>) => html`
  <btrix-syntax-input
    name=${ifDefined(opts.name)}
    label=${ifDefined(opts.label)}
    language=${ifDefined(opts.language)}
    value=${ifDefined(opts.value)}
    placeholder=${ifDefined(opts.placeholder)}
    ?disableTooltip=${opts.disableTooltip}
    ?required=${opts.required}
  ></btrix-syntax-input>
`;
