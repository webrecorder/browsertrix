import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Button } from "@/components/ui/button";

import "@/components/ui/button";

export type RenderProps = Button;

export const renderButton = ({
  variant,
  filled,
  label,
  raised,
  loading,
  href,
}: Partial<RenderProps>) => {
  return html`
    <btrix-button
      variant=${ifDefined(variant)}
      label=${ifDefined(label)}
      href=${ifDefined(href)}
      ?filled=${filled}
      ?raised=${raised}
      ?loading=${loading}
    >
      ${label}
    </btrix-button>
  `;
};
