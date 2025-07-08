import { html, type TemplateResult } from "lit";

import type { FilterChip } from "@/components/ui/filter-chip";

import "@/components/ui/filter-chip";

export type RenderProps = FilterChip & {
  anchor: TemplateResult | string;
  slottedContent: TemplateResult;
};

export const renderComponent = ({
  checked,
  selectFromDropdown,
  open,
  stayOpenOnChange,
  anchor,
  slottedContent,
}: Partial<RenderProps>) => {
  return html`
    <btrix-filter-chip
      ?checked=${checked}
      ?selectFromDropdown=${selectFromDropdown}
      ?open=${open}
      ?stayOpenOnChange=${stayOpenOnChange}
      @btrix-change=${(e: CustomEvent) => {
        console.log((e.target as FilterChip).checked);
      }}
    >
      ${anchor} ${slottedContent}
    </btrix-filter-chip>
  `;
};
