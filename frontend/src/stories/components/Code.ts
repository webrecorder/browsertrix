import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Code } from "@/components/ui/code";

import "@/components/ui/button";

type Language = `${Code["language"]}`;

export type RenderProps = Omit<Code, "language"> & { language: Language };

export const renderCode = ({ language, value, wrap }: Partial<RenderProps>) => {
  return html`
    <btrix-code
      language=${ifDefined(language)}
      value=${ifDefined(value)}
      ?wrap=${wrap}
    >
    </btrix-code>
  `;
};
