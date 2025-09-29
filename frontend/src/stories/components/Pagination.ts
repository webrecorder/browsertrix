import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Pagination } from "@/components/ui/pagination";

import "@/components/ui/pagination";

export type RenderProps = Pagination;

export const renderComponent = ({
  page,
  name,
  totalCount,
  size,
  compact,
  persist,
}: Partial<RenderProps>) => {
  return html`
    <btrix-pagination
      page=${ifDefined(page)}
      name=${ifDefined(name)}
      totalCount=${ifDefined(totalCount)}
      size=${ifDefined(size)}
      ?compact=${compact}
      ?persist=${persist}
      @page-change=${console.log}
    >
    </btrix-pagination>
  `;
};
